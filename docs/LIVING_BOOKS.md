# Living Books: the six showcase books as interactive Tela documents

**Owner direction (2026-10-09):** the showcase books must not be flat. Each book is a **Tela document**. Each page has a **flat version for export** and a **code version that comes alive in the Lorea reader on Plajah**: its objects animate, react to touch, make sound, play music and read aloud. They are meant to **showcase the interactivity of the Tela format**, and authors must be able to edit all of it.

## Honest starting point
- The art is **generated in code**: deterministic TypeScript designers draw named vector objects (no image model). That is exactly what makes it animatable: Bo's eyes, Mars's blush, Coral's stripes are separate objects with labels.
- The platform today has a seed of this: Tela docs can carry per-object motion tracks (`templatePreset.motion`) and a tiny audio spec; the evite stage has tilt parallax, tap bursts and particles. **Missing:** a behaviour system (triggers, actions, state), a book audio and music engine, read-aloud with highlighting, an author-facing editor for all of it, and publishing it inside the Tela bundle.
- What was published on 2026-10-09 is the **flat rendition only** (page images in the comic reader). It stays as the export version and the fallback for older readers.

## One document, two renditions
| | Flat | Living |
|---|---|---|
| Where | PNG / PDF / fixed-layout EPUB; legacy readers | Lorea reader (TelaBookReader), Tela editor preview |
| Source | the page's vector objects at rest | the same objects + `LivingBook` data (behaviours, scores, narration) |
| Interaction | none | tap, press-and-hold, drag, proximity, tilt, keyboard, games with goals |
| Sound | none | synthesised sfx, instruments the child plays, music cues, ambience, read-aloud |
| Export | is the export | stripped; the export fidelity report lists what was left out |

The contract (types for behaviours, actions, triggers, scores and the audio API) is `services/living/contracts.ts`. Everything is data, so authors edit it and remixers inherit it.

## Architecture
1. **Behaviour runtime** (`services/living/runtime/*`, `components/living/TelaLivePage.tsx`): renders a page's objects as live SVG, resolves targets, runs idle animations, listens for pointer, touch, keyboard and tilt, evaluates conditions and variables, runs actions, tracks goals. Honours reduced motion, accessibility and performance (transform/opacity only; one rAF loop; idle pages sleep).
2. **Audio engine** (`services/living/audio/*`): WebAudio only, nothing downloaded. SFX catalogue (synthesised), instruments (music box, marimba, felt piano, harp, pluck, flute, kalimba, bell, glass, kazoo, pad, bass, drums), a tiny score sequencer, ambience beds, reverb and depth low-pass, ducking, voices that bend pitch, TTS read-along with word highlighting (Aria voice proxy when configured, browser speech otherwise).
3. **Authoring** (Tela editor, "Live" mode): select an object, open the Behaviours inspector, add from a preset gallery (Float, Blink, Tap to beep, Drag to reveal...), edit triggers, actions, sounds and music, preview, and save into the document. Authors can also import their own sounds and record their own narration per page.
4. **Showcase builder + publisher** (`scripts/showcase/*`): builds each book as a Tela document whose pages are the designer's named objects plus its `LivingBook`, publishes it as the album's Tela edition (so the reader opens the living version) while keeping the flat pages as the export and fallback.
5. **Six living editions** (`data/showcase/living/<book>.ts`): the interactions, scores and sounds below.

## The six living editions (each shows off a different part of the format)
**Moon Blanket (2-4), felt: gentle, tactile, sleepy.** Breathing bear; candle flicker; tap the candle to blow it out and the room dims (page tint) and relight it. Drag the blanket corner to lift it and reveal the moth. The guessing game: tap mouse / cat / moon, each answers "No!" with a different soft sound. Flit flutters on a path and chimes when tapped. Tuck-in finale: drag the blanket up to Bramble's chin, the lights dim, the lullaby slows (`musicTempo`), the moon's smile grows, a soft haptic hum. Music: a music-box lullaby that slows page by page. Shows: drag, state, tempo control, haptics, dimming.

**Beep Block Street (3-5), pop: loud, rhythmic, cause and effect.** Tap Bo to BEEP, pitch depends on where you tap (an instrument). The windows wake with sound. The traffic jam: tap each car for a different honk, a chorus builds. Drag Pip into Bo's tailpipe and pull to POP (drag with progress var), the beep returns with a big sound and confetti. A real Find-Pip game with counter and celebration. City ambience plus a bouncy synthesised groove. Shows: instruments, drag progress, games and goals, particles.

**Orbit Party! (4-6), cut-paper: music and emotion.** Planets orbit; **each planet is a note** (a pentatonic space xylophone: tap any planet to play it, tap in order to play a tune). Zib's kazoo: press and hold to toot, drag to bend the pitch. Nova follows your finger and leaves a sparkle trail. **Mars's shyness is the mechanic**: approach slowly and Mars peeks out and blushes; rush at him and he hides (proximity with speed). Dance page: tap to start a generated beat and the planets dance in time. Tilt parallax on the stars. Shows: proximity-speed triggers, sustained pitch-bend voices, follow-the-pointer, beat sync, tilt.

**Little Fox, Big Trees (5-7), linocut: rhythm, atmosphere, suspense.** "Left foot, right foot, hush": alternate-tap two footprints to walk Tam through the forest (a rhythm game that scrolls trunks with parallax). Tilt parallax between trunk layers. Crunch / Rustle / Peek: tap each panel, each plays its sound and reveals its part; the hush page ducks all sound to near silence with crickets. Drag the lantern along the gold path; fireflies gather. Music: plucked folk strings; ambience: forest wind and a distant owl. Shows: alternating-tap rhythm, parallax, ducking and silence as a tool, scroll-linked motion.

**Below the Blue (6-8), watercolor: the world changes as you go deeper.** **Drag Coral down** (a depth slider): the water darkens through the light zones (labelled for older readers), bioluminescent dots appear, jellies light up, and **the audio changes with depth** (music and ambience get muffled, quieter and more reverberant via `depth`). Lumi's glow follows the finger. Tap jellies for glass chimes. Mabel's whale song: a long, low gliding voice with big reverb when you tap her eye. Spot-Lumi game with real hidden Lumis. Music: ambient pad plus harp arpeggios. Shows: a variable driving visuals AND audio, voices with pitch glide, hidden-object game, science through interaction.

**The Golden Thread (7-9), papercut: touch as storytelling.** **Pull the thread**: drag along the path and the gold thread draws behind your finger (draw-on bound to drag progress); tug haptics; each pull plucks a harp note rising in pitch. Stitch the wolf's coat by dragging along the dashed stitches; weave the bridge by dragging across the river; flick to throw the thread up to the moon. The knot: drag to unwind it and watch it loosen, turn and finally spill gold across the sky. The activity "Follow the thread" actually validates your traced path. Music: folk harp and drone that grows richer with every task completed. Shows: path-following drag, draw-on animation tied to input, validation, music that evolves with story progress, haptics.

Every page also has quiet **idle life** (breathing, blinking, twinkling, drifting) and **read-aloud** with highlighted words; a "Read to me / Read myself / Auto-play" switch; a sound switch; and reduced-motion twins.

## Build phases
- **Phase 1 (parallel):** (A) runtime + authoring, (B) audio engine + narration, (C) Tela document builder + publisher. All code to `services/living/contracts.ts`.
- **Phase 2 (parallel):** the six living editions, two per builder, using A/B/C.
- **Phase 3:** publish: each album keeps its flat pages (export and fallback) and gains the living Tela edition; verify in the reader.

## Acceptance (what "done" means)
- Open any book in the Lorea reader: pages animate on their own, every interactive element responds with sound and motion, music plays after the first tap, narration highlights words, everything is operable by keyboard, reduced-motion and sound-off still work and read well.
- Open the same book in Tela: select an object, see and edit its behaviours; change a sound or a trigger; preview; save; reopen.
- Export to PDF/EPUB: pages look exactly like today; the fidelity report lists what the export dropped.
- Performance: pages stay near 60 fps on a mid phone-class budget (transform/opacity only; idle pages sleep); no sound until a gesture.
- Nothing is verified "on device" until it actually is: be explicit.

## Later: Read aloud -> Plajah Academia Voca (noted 2026-10-10, not built)
The reader's "Read page" button should hand the page's story to **Plajah Academia Voca** (the read-aloud / fluency tech) instead of only playing the narrator:
the child performs the page, Voca scores it, and the performance is added to the student's **Education Ledger / records**.
- A student account: the performance goes to their ledger as usual (see the Education Ledger and Homeroom + Voca notes in memory).
- Anyone not a student: it still works, and the performance is added automatically to that user's Academia activity, shown under **Continue learning**.
- Integration into Lorea (the BookReader / living pages, `components/living/LivingReaderBar.tsx` compact bar) is a later task. Until then "Read page" plays the narrator for that page.

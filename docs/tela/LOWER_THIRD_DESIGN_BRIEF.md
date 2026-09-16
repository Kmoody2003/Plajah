# Fabula Lower Third Design Brief — the design-history set

Companion to `TEMPLATE_DESIGN_BRIEF.md`. These lower thirds let a creator carry one design language from a Tela document into a Fabula film. Each follows a Tela style era (`family` = era id) but is designed as **motion**: what enters first, what follows, how it leaves.

## Engine (read `services/fabula/lowerThirds.ts` fully)

- Design space 1920×1080. `origin` is an anchor in % of frame (the editor drags it); all layer/text geometry is **relative to the origin** in design px. Negative y = above the anchor.
- `layers: LTLayer[]` back → front. Kinds: rect (rx), ellipse, line (x,y → x+w,y+h), path (0..100 box `path` string — use `services/tela/ornaments.ts` generators). Fill/stroke use colour **tokens** `'accent' | 'ink' | 'paper' | 'secondary'` (or a literal). Optional `gradient: {angle, from, to}`, `blend`.
- Motion: `in: mo(type, duration, delay, ease, amount)`; `out` optional (defaults to mirroring IN). Types: slideL/R/U/D, wipeL/R/U/D, growX, growY, fade, pop, spin, drop. Eases: out, inOut, expo, back, bounce, linear.
- Text roles `title`, `subtitle`, optional `tag`: `{ font: FontKey, weight, size, color, tracking?, upper?, italic?, x, y, w, align, anim: anim(type, duration, delay, out, stagger), delay?, shadow?, maxLines? }`. Animators: none, typeOn, fadeUp, fadeIn, tracking, scramble, wordSlide, blurIn, dropIn. `maxLines` default 2 — names shrink to fit.
- `defaults` (title/subtitle/tag sample text), `duration` (recommended clip length, 4–7 s), `lesson` (DesignLesson — principle about THIS motion design, 2–4 sentence accurate history of the style AND of how it translates to motion/broadcast, tryThis exercise in the inspector, interestTag = era name), `tags`.
- Exemplars: `services/fabula/lowerThirdLibrary.ts` (8 broadcast/genre designs). Match that quality and specificity.

## Rules (tests enforce)

1. Resting graphic fully inside the frame at the default origin (`lowerThirdBounds`), with the title box's 2 lines counted. Keep the rest inside title-safe (≈ 5 % margins) — total width ≤ ~1100 px for left-anchored designs.
2. Something must visibly animate IN (offset/opacity/scale/clip at t=0) and OUT (by the clip end).
3. 2–12 layers. Staggered timing: layers arrive 0.08–0.3 s apart in a deliberate order; text follows its plate. Total IN ≤ 1.6 s; OUT ≤ 0.8 s.
4. Fonts by FontKey; two families max per design; pick from the era's direction in TEMPLATE_DESIGN_BRIEF §4.
5. Unique id (`lt-<era>`), `family: '<era id>'`, `group` = one of `'DESIGN HISTORY'` for all of these (the gallery chips split by group; the era shows in the card).
6. Deterministic; no Math.random.

Verify:
```
cd /c/Users/Kenne/plajah && npx tsx --test tests/lowerThirds.test.ts && npx tsx scripts/telaGallery.ts "%TEMP%/lower.html" lower
```
Both must pass / print `lint clean`.

## The set (24) — motion direction

- **lt-bauhaus** — red circle pops (back ease) → black rule grows from it → lowercase title (archivo 800) word-slides. Yellow triangle drops in last as a period. OUT: rule shrinks, circle pops out.
- **lt-swiss** — nothing but type on a grid: a hairline grid of 3 short rules wipes → title (inter 900) fades up flush-left → red square pops. Subtitle tracked caps. OUT reverses in .4 s.
- **lt-constructivist** — a red band rotated −12° slides from the left off-frame → black wedge (path) follows → uppercase condensed title (anton) drops in; a white “!” bar. OUT slides off right.
- **lt-de-stijl** — three black rules (10 px) grow in x/y with different delays → a primary block fills a cell (growX) → title in the largest cell fades in. OUT: blocks fade, rules shrink.
- **lt-art-deco** — reuse the Deco grammar but as a left-anchored ID: stepped plate grows, gold hairlines, small sunburst quarter behind the initial, tracked Limelight title.
- **lt-art-nouveau** — a whiplash curve (path, stroke) draws via wipeR → a soft ogee-topped plate fades → title in yeseva fades up, subtitle in lora italic.
- **lt-victorian** — a centred playbill card: scalloped top (scallopPath) grows down, two rules with a diamond, title in abril centred with tracking-in, subtitle in robotoSlab caps. Origin x 50.
- **lt-gothic** — pointed-arch window (pointedArchPath, stroke gold) grows up from the base → dark plate wipes up inside it → blackletter (unifraktur) title fades; cardo subtitle. Use for ecclesiastical/ history content.
- **lt-memphis** — confetti pieces (4–6 small paths) pop in with bounce at different delays → a black block with a pink squiggle (sineOpenPath stroke) wipes → chunky title (rubikMono) pops. OUT: everything pops out in reverse.
- **lt-punk** — torn strip (tornEdgePath) slides down with a slight rotation, black tape rect spins in, title in anton uppercase with scramble animator, subtitle in specialElite typeOn.
- **lt-vaporwave** — perspective grid hint (3 lines) wipe up → a gradient sun (ellipse, gradient pink→peach) rises (slideU) → title duplicated: a cyan ghost layer isn't possible for text, so use a pink plate offset 4 px behind a cyan plate → title in orbitron tracking-in; subtitle majorMono.
- **lt-y2k** — translucent pill (rx = h/2, white .14) pops → chrome bar (gradient) grows → bubbles (3 ellipses) pop with bounce → title audiowide blurIn.
- **lt-brutalist** — a 12 px black frame rect (stroke) grows Y then X? (two rects: vertical then horizontal) → mono coordinates tag → oversized title (bigShoulders 900, size 110) drop in, subtitle ibmPlexMono.
- **lt-minimalist** — a 1 px hairline grows over 1.2 s; title (manrope 300) fades in over 1 s; subtitle fades. That is all. OUT: fade .6.
- **lt-midcentury** — boomerang (boomerangPath) slides from left → atomic dots (3 small circles) pop → title outfit 700 fadeUp; rounded (rx 30) mustard plate.
- **lt-space-age** — two orbit rings (ellipse stroke) spin in → capsule plate (rx = h/2) grows X → title orbitron tracking; subtitle michroma tiny caps.
- **lt-psychedelic** — three wave ribbons (wavePath) slide in staggered in magenta/gold/teal → blob plate (blobPath) pops → title righteous fadeUp; subtitle nunito.
- **lt-grunge** — brush stroke (brushStrokePath, multiply blend, .8 opacity) wipes right → misregistered second stroke in accent offset 6 px → title oswald 700 with a slight rotation (−1.5) fades; subtitle specialElite.
- **lt-new-wave** — stepped rules (3 rects at different y and lengths) grow at staggered delays → a colour field block slides down → layered title (syne 800) wordSlide, subtitle dmSans tracked.
- **lt-harlem** — spotlight circle (ellipse, ink at .2) pops → syncopated rules (4 rules of different widths) grow in a rhythm (delays .0/.12/.2/.36) → title playfair 900 fadeUp; kicker bebas.
- **lt-ukiyoe** — a flat wave band (wavePath high amp) slides in from the right → red seal square pops → vertical label impossible (no rotation on text) so use a tall narrow plate + small shippori subtitle; title shippori 700 fadeIn.
- **lt-islamic-geometry** — eight-point star (eightStarPath) spins in (spin, amount 45) → a frieze of 3 small stars pops staggered → gold hairline grows → title amiri fadeIn, subtitle cairo.
- **lt-mexican-modern** — a flat sun (radial lines are LINE layers: 8 short lines around a circle) pops → heavy black woodcut rule grows → title anton/bebas 900 pink dropIn; subtitle bitter.
- **lt-afrofuturist** — radiant crown: 5 concentric rings (stroke, gold/teal alternating) pop in from the centre outward with .08 s steps → indigo plate fades → title unbounded tracking-in; subtitle sora.

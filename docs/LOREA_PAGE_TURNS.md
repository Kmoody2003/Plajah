# Lorea page turns

Page-turn animation for the Lorea reader: a curated set of book-appropriate transitions, a drag-to-turn engine, a reader
setting, an author choice stored on the book edition, and a lab page to play every one of them.

Run the tests with `npm run test:pageturn`. Open the lab with
`npx vite --config page-turn-lab.vite.config.mjs` then `http://127.0.0.1:3140/page-turn-lab.html`
(`?style=curl&scrub=0.5` freezes a frame, `?perf=1` turns through a 240-page book and prints frame gaps).
Frame captures are produced by `node scripts/lorea/capturePageTurns.mjs` into `docs/lorea-page-turns/`
(`<style>-<variant>-<000|030|060|090>.png`, variants `ltr`, `rtl`, `spread`, `back`).

## The set

| id | Name | Interactive (drags) | Spread-aware | Notes |
|---|---|---|---|---|
| `none` | None | no | n/a | instant |
| `curl` | Page curl | yes | falls back to flip | peel with a moving, tilted fold line, reflected paper back with a faint ghost of the page, crease/crest shading, cast shadow on the page below |
| `flip` | Page flip | yes | **yes** | 3D swing around the spine; single page hinges on the spine edge, a spread flips the right (LTR) or left (RTL) page and shows the arriving spread's opposite page on its back |
| `slide` | Slide | yes | whole spread moves | push, both pages travel |
| `cover` | Cover | yes | whole spread moves | top page slides off, the page beneath drifts in with a dimming shadow |
| `dissolve` | Cross-dissolve | no | whole spread | gentlest; the reduced-motion fallback |
| `wipe` | Wipe | yes | whole spread | soft edge sweeping from the edge the page is pulled from |
| `iris` | Iris | no | whole spread | circle opening from the edge you turned from |
| `zoom` | Zoom through | no | whole spread | outgoing recedes forward, incoming pushes in |
| `cardflip` | Card flip | yes | whole spread | two-faced card about its centre axis |
| `cube` | Cube | yes | whole spread | both pages are faces of a cube |

"Back" is the forward animation played in reverse with the two surfaces swapped, for every physical style
(curl, flip, slide, cover, zoom, card flip, cube). That is exactly what un-turning a page is, and it makes drag-back,
tap-back and the keyboard identical mirrors of forward. Wipe, iris and dissolve are not physical, so they pick their edge
from the travel direction instead.

## What was reused from Fabula / Pixels, and what was not

The film transitions (`components/plajahPixels/engine/fx/phase3Transitions.ts`, published through
`services/fabula/forgeTransitions.ts`) are **GLSL shaders over two textures**. A reader page is live DOM: selectable text,
iframes, canvases, embeds. Turning a DOM page into a texture needs html2canvas-class tooling that loses fonts and cannot see
inside iframes, so the renderer for the reader is **CSS 3D transforms + clip-path + masks + gradient overlays**, GPU
composited, no WebGL requirement. No WebGL path was added: no Forge shader "drops in cheaply" because there is nothing to feed
it. What IS shared is specification data, and `tests/pageTurn.test.ts` checks the mapping against the real modules so it cannot rot.

| Page turn | Borrowed from | What exactly |
|---|---|---|
| all | `services/dossier/film/motion.ts` | easing curves (`ease(kind, x)`), so reader and film timeline feel alike |
| flip | Forge `cube-turn` / Turn Left | `perspective` and `shade` params and defaults (same camera model); hinge geometry is new |
| cube | Forge `cube-turn` / Turn Left | axis, perspective, edge shading, defaults |
| cardflip | Forge `swish-3d` / Swing Left | `perspective`, `shade` defaults; a two-faced card is new |
| slide | Forge `push-slide` / Push Left | `angle` convention (180 = leaves left, mirrored for RTL) and `softness` default |
| iris | Forge `wipe-circle` / Iris Open | `softness`, `cx`, `cy`, `invert`, same defaults; origin is moved to the turned-from edge at run time |
| zoom | Forge `dolly-fade` / Push In | `amount`, `ease` defaults; back is Pull Out by reversal. No defocus (blur on a full page per frame is too costly) |
| dissolve | Forge `film-dissolve` / Clean Optical | `softness`. The film version is gamma-aware in a shader; CSS opacity blends in sRGB |
| wipe | Forge `wipe-stripes` / Broad | same maths with one band; `softness` param. Forge has no plain linear wipe |
| cover | Forge `push-slide` (inspired) | direction convention; parallax and edge shadow are new |
| curl | Forge `fold-turn` / Book (inspired) | nearest film cousin is a hard hinge fold with crease shading; the peel, the angled moving fold and the reflected back face are new |

Film transitions that do not translate to paper and were deliberately left out: glitch, RGB split, film burn, light leak, static,
vortex, plasma, flashbulb, pixelate, fluid, note tunnel and the rest of the effect-style set.

The curl is a flat reflected peel with cylinder-style shading (dark crease, bright crest, falling-off back), not a true
bent-mesh curl. A true cylinder needs a WebGL mesh; this reads as a real curl at page-turn speed but is not physically bent.

## Architecture

* `services/lorea/pageTransitions.ts` pure: registry, resolution (author vs reader vs reduced motion), direction/RTL
  mapping, drag decision math, spring, EPUB degrade table.
* `services/lorea/pageTurnFrames.ts` pure: per-frame CSS for every style as a function of progress (geometry, matrices,
  clip polygons, gradient stops). No DOM.
* `components/lorea/PageTurn.tsx` wraps the live page. Timed turns: the parent just changes the page (`pageKey`, `order`);
  PageTurn keeps the previous node, plays the transition and tears the extra layers down. Drag turns: the page follows the
  pointer, release decides commit/cancel from velocity + progress, a spring settles, then `onTurn(dir)` asks the parent to
  change the page and the resulting key change is recognised and not animated twice.
* `components/lorea/usePageTurn.ts` resolves which style plays and owns the reader's device-local settings.
* `components/lorea/PageTurnSettings.tsx`, `PageTurnPreview.tsx`: the reader setting and the author's preview.
* `components/lorea/epubTurn.ts`: the EPUB path (below).
* `services/lorea/pageRustle.ts`: optional synthesized paper sound (WebAudio, no asset files).

Performance rules: while a turn plays only `transform`, `opacity`, `clip-path`, `mask` and gradient overlays change, written
straight to DOM nodes from one `requestAnimationFrame` loop (no React state per frame, no layout reads; size is cached by a
ResizeObserver). `will-change` is set on layers when a turn starts and cleared when it ends. At rest the DOM is one wrapper
and one layer around your page. Listeners, rAF and body `user-select` are restored on unmount. Writes are de-duplicated per element.
Long jumps (contents, scrubber, resume, `|delta| > 1`) fade for 240 ms instead of curling through forty pages. Rapid
repeated turns shorten to 70% of the duration.

## Where it is wired

| Surface | What happens |
|---|---|
| Parsed PDF / DOCX / TXT pages (`BookReader.tsx`) | Full engine. Tap zones, arrow keys, narration auto-turn and follower mirroring all just change the page, so they animate with no extra code and followers never re-broadcast (the broadcast effect is untouched). Dragging from the edge (mouse) or anywhere horizontally (touch) follows the page. |
| EPUB (`BookReader.tsx`, epub.js) | **Not a real curl.** See below. |
| Native comic / manga page lists (`ComicReader.tsx`) | Full engine, single page and two-page spread, RTL (its own LTR/RTL toggle is honoured). Spread uses the real spine flip. |
| Tela upgraded books (`TelaBookReader.tsx`) | New **Pages** mode (header toggle). The existing continuous-scroll reader is unchanged and is still the default unless the author chose a page turn or the book is visual-led. Positions share the same `lorea_pos_<id>` shape in both modes. |
| PDF in the react-pdf viewer (`isPdfReader`) | Not wired (it has its own prev/next and zoom model). |

### EPUB

epub.js renders EPUB pages inside a cross-document iframe and reflows on demand. There is no cheap, faithful snapshot of the
outgoing page (cloning the iframe reloads it; rasterising it loses fonts and images). So a true curl, flip or cube is
impossible there. What runs instead, on the live reader surface: exit animation, `rendition.next()/prev()`, enter animation
from the opposite side (`epubTurn.ts`). Curl, flip, cube, card flip, cover and slide become a directional slide-and-fade;
dissolve, wipe, iris and zoom keep their kind. RTL and back are honoured. Followers on EPUB get the same pair (direction is
not known, so forward). It is limited to 360 ms and skipped while another EPUB turn is running.

## Settings

Reader (Reading Settings > Page animation, in the Tela reader the sliders button, and in the comic toolbar):

* **Author's choice** (default) follows the book edition, falling back to a per-format default.
* **Reduce**: a 140 ms fade, no motion, no drag-following (a swipe still turns the page).
* **Off**: instant.
* Or force any one style.
* **Soft page sound**: off by default, synthesized with WebAudio, never plays for reduced motion, hidden tabs or `none`.

`prefers-reduced-motion: reduce` always wins and is followed live if the OS setting changes. An author's `none` is never turned into
an animation. Settings are device-local (`lorea_page_turn_prefs`).

Per-format defaults when the author leaves it on Auto: novel -> curl, picture book -> flip, comic and manga -> slide
(manga is RTL-aware), textbook -> cross-dissolve.

## How authors choose a style

Book editor > Upgrade to Tela > **Page-turn style**: a live preview, a book-wide choice (Auto, any style, None) and an optional
per-chapter override. It is stored on the upgrade record (`BookTelaUpgrade.pageTurn`), published inside the immutable Tela
bundle (`BookTelaBundle.pageTurn`) and copied to `albums/{id}.bookTela.pageTurn` (small) so the classic reader sees it too.
Buyers who are pinned to an older Tela version keep the choice that shipped with that version. After changing the style on an
already-published book, publish the Tela edition again. The data model also supports `perPage` (frame id) overrides, which
win over chapters; the editor UI currently offers book-wide and per-chapter only.

The style used for a turn is the one set for the page being left.

Export is unaffected: EPUB and PDF stay standard files. Page turns do not export, and the fidelity report (editor and export
dialog) now says so (`READER_ONLY_NOTES` in `services/bookTela/model.ts`, `ExportReport.readerOnly`).

## RTL

Forward in an RTL book (`readingDir: 'rtl'`) leaves to the RIGHT, taps and arrow keys mirror (left side/arrow advances), a
mouse drag from the left edge advances, the curl's fold line is the exact mirror image, the flip hinges on the right, the spread
flip turns the left page. LTR behaviour is unchanged.

## Limits and honest notes

* Curl on a two-page spread is a flip (the spine is the fold).
* Heavy embeds (Tela 3D, video, Lottie) on the outgoing page are mounted a second time in the transition layer, so they can
  restart during the 0.3 to 0.8 s turn. The curl's back is plain paper (no see-through ghost) for those pages (`heavy`).
* The incoming `TelaEmbed` mounts fresh, so a frame of blank can show before its snapshot paints when dragging.
* Mouse text selection near the page edge competes with edge dragging (touch is unaffected: a long-press selects).
* No WebGL path. See above.
* The follower's page broadcast is untouched; EPUB follower direction is assumed forward.

## Unverified

See the final report of the build that added this (visual proof was done in a desktop Chromium via Playwright against the lab,
not on a phone, a TV or in Safari/Firefox). The reader integrations were type-checked in a scoped tsconfig and the engine is
unit tested, but the full reader (BookReader, TelaBookReader, ComicReader) was not driven end to end with a real book.

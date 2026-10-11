# Tela gauntlet — program contract

Started 2026-10-10. The goal is to close the gaps in `TELA_GAP_ASSESSMENT_AND_STORYBOOK_STUDIO.md`, build the platform text engine, and then build the Storybook Studio. Storybook art is **built in code on the Tela engine**: the author shows one or a few style examples and the studio writes the rest as procedural designers, like `services/tela/designs/publications/storybooks*.ts`.

## Waves

| Wave | Work | Modules (owned) |
|---|---|---|
| 1 | Engines, pure and testable, with no UI wiring | `rust/plajah-text` + `services/text/**` (text engine) · `services/tela/sheet/**` (spreadsheet engine) · `services/tela/raster/**` (raster engine) · `services/tela/geometry/**` (vector geometry) · `components/tela/telaHistory.ts` (undo/redo) |
| 2 | Device UIs on the engines | Writer → document editor on the text engine · Grid → workbook UI · Studio vector tools · Image tools · Layout (threaded frames, styles, masters, spreads, bleed) · PDF / docx / xlsx / PSD / SVG export |
| 3 | Storybook Studio | Story → Cast → Storyboard → Art (style kit → code designers) → Layout → Living → Proof → Publish |

## Rules for every contributor

- Other Claude sessions edit this checkout concurrently. Run `git status` before editing. Never stash, revert, reset, commit, or rewrite history.
- **Hot shared files:** `types.ts`, `components/tela/TelaView.tsx`, `components/tela/telaOps.ts`, `components/tela/renderDevice.tsx`.
  - Wave-1 engines do not touch them.
  - Exception: a single additive optional field on a device type, when the brief says so.
  - New types live in the engine's own module.
- No new npm dependency unless the brief allows it. Rust crates are fine; they are compiled into the committed `.wasm`, because CI has no Rust toolchain (see `scripts/buildAudioWasm.mjs`).
- Tests use `npx tsx --test tests/<name>.test.ts`. Every engine ships tests. Add them to an npm script `test:<area>`.
- Do not run bare `tsc --noEmit`; it runs out of memory. Use `npx tsc --noEmit -p` on a small tsconfig, or rely on tests and `npx vite build` only when asked.
- Code style:
  - Match the house style: header comment explaining why, dense and direct.
  - Fonts are OFL/Apache only.
  - Respect patents noted in memory. The Slug and Loop–Blinn methods are free to use. Avoid the Dobbie vector-texture method (US 11,216,994) and Adobe neural fonts.

## ArtCraft: reference only (Kenne, 2026-10-10)

ArtCraft (github.com/storytold, MIT OR Apache-2.0, pure Rust) is a **reference, never a dependency**.

- No ArtCraft crates in Cargo, no vendored code, no adopted data models.
- Study its algorithms, and use its outputs as a test oracle, but build our own implementation. Credit any idea we learned from in the engine doc.

**Why:** Tela documents integrate deeply with Fabula (timeline rendering of Tela docs) and The Post Man (Tela letters in DM rooms, bulletins). Nothing may make that integration harder or weaker than what is built. Every engine stays native to Tela's model, our wasm ABI and our TS APIs.

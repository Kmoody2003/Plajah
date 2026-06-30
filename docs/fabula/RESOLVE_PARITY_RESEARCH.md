# Fabula ↔ DaVinci Resolve (Edit page) — Parity Research & Roadmap

Goal: bring **Fabula** to parity with **DaVinci Resolve's Edit page** (the cut/edit surface, not Color/Fusion/Fairlight/Deliver). This doc is the **reference taxonomy** of what Resolve's Edit page offers, the **Premiere** equivalents, the **common keyboard shortcuts** to adopt, and the **prioritized gap roadmap** (the gap column is filled from the Fabula inventory).

---

## 1. Resolve Edit page — the full toolset (by category)

### A. Viewers & playback
- **Dual viewer**: Source viewer (the clip you're cutting from) + Timeline viewer; toggle single/dual.
- **Transport**: Play/Pause, **JKL shuttle** (J reverse / K stop / L forward; multi-tap L or J = 2×/4×/8×; K+L = slow), frame step, 1-second step, go to start/end.
- **In/Out marks** on source and timeline; clear in/out; **Mark Clip**; Mark Selection.
- Loop, viewer mute, full-screen viewer, **playhead scrubbing** + audio scrub, zoom-to-fit.

### B. Editing operations (three-point editing)
- **Three-point editing**: set source In/Out + a timeline In *or* Out → the 4th is derived.
- **Edit types**: **Insert** (ripples), **Overwrite**, **Replace**, **Fit to Fill**, **Place on Top**, **Append**, **Ripple Overwrite**.
- **Blade/Razor** (add edit at playhead; blade-all-tracks), **Selection** tool, **Trim** tool, **Dynamic Trim**.
- **Trim types**: **Ripple, Roll, Slip, Slide**.
- **Ripple delete** (close the gap) vs **Delete/Lift** (leave a gap).
- **Snapping**, **Linked selection** (A/V linked), link/unlink clips.
- **Copy/Cut/Paste** (+ Paste Insert), **Duplicate**, **Nudge** (1 frame / many).
- **Retime / speed** (constant + speed ramps, freeze frame, reverse), **enable/disable clip**, **group/ungroup**.
- **Tracks**: add/delete, **lock**, enable, **solo/mute** (audio), height, auto-track-select, destination track.

### C. Transitions
- **Default transition** (cross dissolve) at edit point, transition picker, **duration**, transition **curve/alignment**, **audio crossfade**.

### D. Inspector (clip attributes) — *the depth Resolve is known for*
- **Transform** (Zoom/Position/Rotation/Anchor/Pitch/Yaw), **Crop**, **Dynamic Zoom** (Ken Burns), **Composite** (blend mode + opacity), **Stabilization**, **Lens correction**, **Retime & Scaling**, **camera/motion blur**.
- **Keyframing** every parameter, with an **ease/curve editor**.
- **Audio**: clip **volume**, **pan**, EQ, levels.

### E. Titles / generators / effects
- **Text / Title** clips (Text, Text+ templates, lower thirds), **subtitle** track, **generators** (solid color, gradient, noise), **effects/OpenFX** library, **Fusion** templates.

### F. Organization
- **Markers** (colored, named, with notes), **flags**, **clip color**, **clip names**, **Edit Index / timeline index**, find, marker list.
- **Multicam** editing.

### G. Audio
- **Meters**, levels, normalize, **fades/crossfades**, mute/solo, pan, audio waveforms.

### H. Timeline view & navigation
- **Zoom** in/out + zoom-to-fit, scroll, **track height**, thumbnails/waveforms, audio scrub, timeline view options.

---

## 2. Premiere Pro equivalents (tool letters differ)
Selection **V**, Track Select **A**, **Ripple Edit B**, Rolling Edit **N**, **Slip Y**, **Slide U**, Rate Stretch **R**, Razor **C**, Pen **P**, Hand **H**, Zoom **Z**. Insert **,** Overwrite **.** Lift **;** Extract **'** Add Edit **Ctrl+K** / all tracks **Ctrl+Shift+K**. In **I** Out **O** Mark Clip **X**. Ripple Delete **Shift+Del**. JKL + Space identical.

---

## 3. Common keyboard shortcuts — proposed Fabula default keymap
Lean Resolve-like (the user named Resolve first); ship **Resolve** + **Premiere** presets + user remapping.

| Action | Fabula default | Resolve | Premiere |
|---|---|---|---|
| Play / Pause | `Space` | Space | Space |
| Shuttle reverse / stop / forward | `J` / `K` / `L` | JKL | JKL |
| Step frame back / fwd | `←` / `→` | ←/→ | ←/→ |
| Jump to prev / next edit | `↑` / `↓` | ↑/↓ | ↑/↓ |
| Go to start / end | `Home` / `End` | Home/End | Home/End |
| Mark In / Out | `I` / `O` | I/O | I/O |
| Clear In / Out | `Alt+I` / `Alt+O` | Opt+I/O | — |
| Mark clip | `X` | X | X |
| Blade / add edit at playhead | `B` | B | Ctrl+K |
| Blade all tracks | `Shift+B` | Ctrl+\\ | Ctrl+Shift+K |
| Selection tool | `A` | A | V |
| Trim tool | `T` | T | — |
| Snapping toggle | `N` | N | S |
| Add marker | `M` | M | M |
| Delete (lift, leave gap) | `Delete` | Del/Backspace | Backspace |
| Ripple delete (close gap) | `Shift+Delete` | Shift+Del | Shift+Del |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` | same | same |
| Cut / Copy / Paste | `Ctrl+X/C/V` | same | same |
| Duplicate clip | `Ctrl+D` | — | — |
| Nudge clip ←/→ 1 frame | `,` / `.` | ,/. | Alt+←/→ |
| Insert edit | `F9` | F9 | , |
| Overwrite edit | `F10` | F10 | . |
| Zoom in / out | `=` / `-` | Ctrl+=/- | =/- |
| Zoom to fit | `Shift+Z` | Shift+Z | \\ |
| Add default transition | `Ctrl+T` | Ctrl+T | Ctrl+D |
| Retime / speed | `R` | R | — |
| Enable / disable clip | `D` | D | Shift+E |
| Split at playhead (alias of blade) | `Ctrl+B` | — | — |
| Open keyboard map | `Ctrl+Alt+K` | — | — |

(Final defaults tuned to avoid conflicts with browser + the host app; combos that the browser reserves like Ctrl+W are avoided.)

---

## 4. Gap analysis — Fabula vs. Resolve Edit page (priority order)
*Filled from the Fabula inventory. P1 = ship first (core edit), P2 = important, P3 = depth/nice-to-have.*

**What Fabula already HAS** (Fabula.jsx, 3405 lines, .jsx): timeline w/ clips + tracks (v1/v2/a1/a2 + dynamic add), playhead, zoom (0.4–2); move/drag clip (snaps to **playhead only**), **end-edge trim only**, **blade** (`bladeClip` at playhead), delete (filter), multicam angle-cut; play/pause (33ms interval) + ruler seek + source viewer; inspector fx (opacity, scale, x/y, rotation, blur, bri/con/sat, blend, fadeIn/Out, matte); titles + subtitles + synced lyrics; track gain/mute (render-only). State: `clips`/`setClips` + `commitClips(next)`, `playhead`, `playing`, `selClipId`, `zoom`, `prod`, `FX_DEFAULTS`, `uid()`. Ops added via handler → `setClips(next)` + `commitClips(next)`.

**What Fabula LACKS** (priority order):
1. ✅ **P1 — Keyboard shortcut system + custom remapping** *(BUILT this pass: `services/fabula/shortcuts.ts` engine + presets, `KeyboardShortcutsEditor.tsx` remap UI, `useFabulaShortcuts.ts` dispatch).* Fabula had only **3 Enter handlers**, zero global shortcuts.
2. **P1 — Core timeline ops** (none exist): **ripple delete vs lift delete**, **duplicate**, **copy/cut/paste**, **snapping toggle** (currently always-on playhead-only), **nudge**, **enable/disable clip**, **start-edge trim** (only end-edge today).
3. **P1 — Transport**: **JKL shuttle**, **frame step**, **jump to prev/next edit**, **go to start/end**, **mark In/Out** (none exist; only play/pause + ruler seek).
4. **P1 — Undo/redo** (none — only IndexedDB autosave). A simple history stack over `commitClips`.
5. **P2 — Transitions** (none): default **cross-dissolve** at an edit point + duration. (Fabula has per-clip fades but no clip-to-clip transitions.)
6. **P2 — Markers** (none): timeline markers (M), clip color/flags.
7. **P2 — Trim modes**: ripple/roll on edit points (slip/slide later); three-point **insert/overwrite** from the source viewer.
8. **P2 — Inspector depth**: **keyframing** of transform/opacity (fx is static today); **speed/retime**; **per-clip audio level/pan** (only track-level, render-only).
9. **P3 — Real audio waveforms** (placeholder bars today; render mixes only the first audio clip — also a fix), audio crossfades, multicam sync UI polish, generators, OpenFX-style stack.

---

## 5. Custom keyboard mapping — design
- **Keymap model**: `action id → KeyCombo` (e.g. `'timeline.blade' → 'B'`). A registry of actions (id, label, category, default combo, Premiere combo).
- **Presets**: Fabula (default), Resolve, Premiere — each a full map.
- **User overrides**: persisted (localStorage now, optional cloud later) layered over the chosen preset.
- **Editor UI**: searchable list of actions grouped by category; click → "press a key…" capture → save; **conflict detection** (warn if a combo is already bound); reset-to-default; preset switcher.
- **Dispatch**: one global keydown layer normalizes the event → a `KeyCombo` string → looks up the action → runs the bound handler (ignores when typing in inputs). Handlers are registered by the editor for each action id.

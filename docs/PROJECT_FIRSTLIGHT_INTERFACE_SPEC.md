# Project Firstlight — opening menu and game interface

Plajah Sports / original browser football game. September 13, 2026.
Status: target interface specification. Current implementation is the local 3D passing lab; the full menu, progression and modes below are not shipped.

## Identity and presentation

Working name: **Project Firstlight**. Brand lockup: small PLAJAH SPORTS above large Project Firstlight; subtitle “Learn the game. Make your play.” Original fictional teams, artwork and stadiums. Working name requires clearance before commercial branding; no league endorsement or official rating is implied.

Use Plajah Surface/Button, typography, theme and motion tokens. Warm purple–magenta–orange hero; orange action emphasis, cyan field guidance, semantic colors for success/errors. Menus follow the user's theme; the field remains visually consistent. Do not turn youth play into a betting-style dashboard. No cash balances, wagering, loot boxes, public authority scores or player-market prices.

## Opening menu

Desktop composition: brand and beta label at top left; Settings and accessibility at top right; left third contains welcome and actions, right two-thirds shows a gently animated original training stadium. Bottom row shows control hints, build version and “Local practice · No account needed.” Static stadium image/gradient replaces motion when reduced motion is enabled. No automatic music.

Action hierarchy:

1. **Play a drive** — primary action; selects assistance then loads the passing lab.
2. **Learn football** — curriculum cards: field, downs, positions and passing. Show only implemented lessons as playable.
3. **How to play** — interactive control explanation plus text equivalent.
4. **Settings** — controls, audio, graphics, accessibility; available before starting.

Later, when functional: My Squad, Private League and challenge modes. Unbuilt modes belong in a clearly labeled development roadmap, not active menu tiles. No login wall for local practice. Saved online youth play uses the eligibility/caregiver flow defined in the Play & Learn spec.

Phone: stadium banner, brand, full-width Play button, then stacked secondary actions. Minimum 44px interaction targets, no text over visually busy turf. Keyboard initial focus goes to Play; visible focus remains distinct from hover. Escape closes submenus and returns focus to their trigger.

## Pre-game setup

Heading “Your first drive.” Show original teams Aurora (purple) and Current (cyan), goal “Reach the end zone,” and format “Simplified passing practice.” Assistance choices: Guided (route explanations and hints) and Practice (minimal guidance); neither changes earned competitive standing because this mode is local/unranked. Default Guided for a first visit. Explain that no running after catch, tackling, kicking or full penalty rules are implemented in the first lab.

Controls shown before entry: A/D or arrows move quarterback; 1/2/3 choose receiver; Space snaps/continues; on-screen buttons support touch. Do not claim controller support until mapping/disconnection handling is implemented. Graphics initializes only after entering play, with loading, unsupported-device and retry states.

## In-game HUD

Top scoreboard: team names/colors and score; central down-and-distance plus field position. Always distinguish real football points from any future fantasy points. Prototype uses an explicit passing-lab label throughout.

Field: gold first-down line and cyan line of scrimmage with a legend. Receiver labels 1 Left / 2 Middle / 3 Right are stable selectable identities, even when routes cross. Target buttons, field labels and explanatory text must agree. A future polish pass should put those labels over the 3D receivers; the current prototype identifies them in its controls.

Bottom action area changes by state:

| State | Primary action | Other feedback |
| --- | --- | --- |
| Ready | Snap the ball | Objective, down/distance, controls |
| Live | Receiver buttons | Pocket timer and movement controls |
| Ball in flight | Disabled passing controls | Follow the throw; no duplicate input |
| Play finished | Continue / Next down | Catch or breakup explanation, yards and first down |
| Drive finished | Play again | Touchdown or turnover summary, optional relevant lesson |
| Paused | Resume | Restart with confirmation, controls, settings, return to menu |

Do not announce frame-by-frame timer updates to assistive technology. Announce phase changes and result text once. Focus shortcuts operate only inside the game; navigation outside it must never move a player. Blur/hidden-tab clears held inputs and pauses play. Touch capture releases on cancellation, window blur and pointer loss. Layout must leave field and controls visible without overlapping browser navigation.

## Learning overlays and recap

“Explain this” pauses practice and displays one concept with a field diagram and text equivalent. Example: “First down: reach the gold line to receive a new set of attempts.” Always offer Close and Resume, never a required quiz to continue play.

Recap presents the actual recorded outcome first, then why the prototype resolved it that way. “A defender was close to the catch point” describes this simulation's breakup rule; do not claim authentic physics or a verified real-world coaching diagnosis. Offer one relevant authored lesson, not a long corrective lecture. Future XP/rewards are displayed only after trusted persistence exists; local prototype has no pretend saved balance.

## Settings and safe defaults

Audio off until user choice; separate music/effects controls when implemented. Reduced motion removes decorative camera movement and celebrations without changing gameplay. Graphics presets adjust render scale and effects, not simulation speed. Text zoom, contrast and keyboard access apply to menus and HUD. Pause is always accessible. Restart/exit explains loss of an unfinished local drive; no shame messages or streak penalties.

No free-text chat, DMs, external links, ads or account identifiers in the local game. Later private league social capability must follow the youth spec rather than inheriting unrestricted Sports fan-room controls.

## Acceptance and asset handoff

Verify menu-to-play-to-recap-to-menu with mouse, keyboard and touch; narrow 390px and wide 1440px layouts; 200% zoom; hidden-tab pause; WebGL failure; repeated entry/exit without leaked GPU resources. All visible modes must work or be explicitly marked roadmap. No external sports media request from local play.

Blender is optional for this procedural prototype. Later asset brief: original low-poly athlete with helmet/body/limb materials, consistent scale, idle/run/throw/catch animations and mobile-friendly geometry, exported as glTF/GLB with documented authorship/licenses. Separate animation polish from deterministic gameplay collision rules. Existing browser Three.js dependency is sufficient to start; no additional paid tool is required.

References: PLAJAH_DESIGN_SYSTEM.md and PLAJAH_SPORTS_PLAY_LEARN_BETA_SPEC.md. Full football, multiplayer and novelty modes are subsequent milestones after this passing loop is tested for fun.

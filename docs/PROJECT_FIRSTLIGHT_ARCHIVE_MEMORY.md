# Project Firstlight — Memory Archive & Master Reference
*Permanent record of design decisions, architecture, code implementations, and visual assets.*
*Date: September 13, 2026*

---

## 1. Project Overview & Core Identity
* **Working Title**: Project Firstlight
* **Brand Lockup**: `PLAJAH SPORTS / Project Firstlight`
* **Tagline**: *"Learn the game. Make your play."*
* **Category**: 3D Tactical American Football Passing Lab & Educational Game
* **Design Language**: 100% true to the **Plajah Design System** (`docs/PLAJAH_DESIGN_SYSTEM.md`)
  * **Brand Mark**: The canonical Plajah Chevron Logo (`M30 20 L70 50 L30 80` in `components/Logo.tsx`) with the signature warm gradient: `--pj-purple` (`#6B0099`) → `--pj-magenta` (`#D40055`) → `--pj-orange` (`#FF8C00`).
  * **Strict Color Semantics**:
    * Solar Orange (`#FF8C00`): Strictly **Action & Signal** ("Play A Drive" CTA, practice QB jersey, pocket timer). Never used for errors or warnings.
    * Electric Cyan (`#00DAF3`): **Spatial Guidance & Realtime** (Line of Scrimmage, Current team defense, target vectors).
    * Amber Gold (`#FFBF42`): **Line to Gain** (10-yard first-down threshold).
    * Frosted Glass: 5-layer elevation system (`rgba(23, 21, 37, 0.85)` + `backdrop-filter: blur(24px)`).
* **Gridiron Correction**: This project is **100% American Football** (Gridiron field, 10-yard markings, hash marks, high yellow goalpost uprights, pigskin football with white laces, helmets and shoulder pads)—NOT soccer.

---

## 2. Implemented Code & Platform Integrations

The following files are active in the repository:

1. **`firstlight.html`** (Root Directory):
   * Standalone, zero-dependency 3D playable American Football passing simulator running Three.js via CDN + Web Audio API.
   * Runs immediately in any browser without build tools or local servers (double-click to play).
   * Features: 3D gridiron, yellow uprights, animated QB, 3 receivers running Out/Seam/Dig routes, dynamic separation target rings (Green = Open, Red = Covered), defensive pursuit AI, 7.0s pocket countdown with -4 yd sack penalty, parabolic spiral throw, referee whistle, crowd roar, and catch audio.

2. **`components/sports/ProjectFirstlightLandingView.tsx`**:
   * Official Plajah platform landing page for Project Firstlight.
   * Features: Platform top navigation, hero banner with stat badges, live embedded 3D Three.js passing lab toggle, 3-card Football Curriculum explorer (Field & Downs, Route Breaks, Pocket Scramble), and Admin Telemetry & Invariants inspector.

3. **`components/AppsView.tsx`**:
   * Added the **Project Firstlight** app card to the platform's app launcher.
   * **Gated Strictly to Admins**:
     `currentUser?.role === 'admin' || currentUser?.role === 'staff' || currentUser?.email === 'kmoody2003@gmail.com'`
   * Features: Canonical glowing Plajah SVG Chevron Logo, "Firstlight", "3D Football Lab", "Admin Only" badge, "3D WebGL" pill.
   * On click: Dispatches `window.dispatchEvent(new CustomEvent('plajah:openFirstlight'))`.

4. **`App.tsx`**:
   * Added `retryLazy` import for `ProjectFirstlightLandingView`.
   * Added event listener for `plajah:openFirstlight` to switch view to `'PROJECT_FIRSTLIGHT'`.
   * Added view renderer: `<ProjectFirstlightLandingView onBack={() => setView('APPS')} currentUser={userProfile} onNavigate={(v) => setView(v as any)} />`.

5. **`types.ts`**:
   * Added `'PROJECT_FIRSTLIGHT'` to the `AppView` union type.

6. **`services/firstlightGame.ts` & `tests/firstlightGame.test.ts`**:
   * Pure deterministic TypeScript simulation state machine.
   * 4 automated unit tests passing 100% (`npx tsx --test tests/firstlightGame.test.ts`).

---

## 3. High-Fidelity Visual Concept Renders (Brain Artifacts)

All generated visual assets and pitch decks are preserved in the persistent artifact directory:
`C:\Users\Kenne\.gemini\antigravity\brain\691f3fc6-783a-41d2-bce4-7069964922a9\`

| Asset / File | Description |
| :--- | :--- |
| `firstlight_plajah_brand_hero_1789345428165.jpg` | Center-stage title screen featuring the giant glowing Plajah Chevron Logo, stadium aurora dawn sky, and holographic 50-yard line turf mark. |
| `firstlight_menu_plajah_brand_1789345739123.jpg` | Updated Main Menu with the Plajah Chevron Logo in the brand lockup, glowing "PLAY A DRIVE" button, and dawn stadium view. |
| `firstlight_gameplay_concept_1789345138081.jpg` | 3D in-game passing simulation view: QB in pocket, purple receivers with route break rings, cyan defensive coverage, and laser field lines. |
| `firstlight_pregame_setup_1789345207906.jpg` | Pre-game setup modal: Aurora (purple flame) vs. Current (cyan wave) team crests, Guided vs. Practice mode, and control diagram. |
| `firstlight_football_landing_page_1789345888123.jpg` | 100% American Football web portal landing page with gridiron preview, route tree card, 7s pocket clock card, and safe play badge. |
| `firstlight_football_multidevice_1789345848595.jpg` | Multi-device pitch slide: laptop (3D gridiron & yellow uprights), tablet (Plajah menu), and phone (route diagram). |
| `firstlight_prototype_current.png` | Baseline Three.js prototype screenshot tracking evolution from day one. |

---

## 4. Master Documentation & Pitch Artifacts

The following self-contained markdown documents were authored and saved:

1. **`project_firstlight_market_pitch_deck.md`**:
   * 10-Slide Investor & Partner Pitch Deck.
   * Contains TAM analysis ($38.5B sports gaming & edtech), competitive matrix (Firstlight vs. EA Madden vs. Retro Bowl vs. DraftKings), Plajah flywheel synergy, ethical monetization (cosmetics only, zero gambling), and cross-platform reach.
2. **`project_firstlight_master_pitch.md`**:
   * Unified master presentation containing the full 6-slide carousel, brand identity specs, SVG code, core mechanics, team lore, screen blueprints, and engineering architecture.
3. **`project_firstlight_build_guide_and_ai_studio_prompts.md`**:
   * Technical build guide: 3-tier architecture (Presentation, WebGL 3D, Deterministic Engine), fixed-step 60Hz loop, and asset pipeline.
   * Copy-paste ready prompts & System Instructions for **Google AI Studio** (Gemini 1.5 Pro / Gemini 2.0).
4. **`project_firstlight_menu_and_landing_design.md`**:
   * UI/UX interface specification with CSS design tokens and responsive layout rules.

---

## 5. Core Game Mechanics & Rules Summary

* **Format**: 3-on-3 passing duel (1 QB vs. 3 Secondary defenders covering 3 Receivers).
* **Drive Setup**: Starts at 20-yard line, target is 30-yard line (1st & 10). 4 downs to advance 10 yards.
* **Pocket Pressure**: 7.0-second countdown clock. Exceeding 7.0s results in a pocket collapse sack (-4 yards).
* **Scramble**: QB moves laterally ($x \in [-21, 21]$) using `A`/`D`, `Arrow Keys`, or touch buttons.
* **Separation Logic**: At pass arrival ($t = 1.0$), defender proximity is evaluated:
  $$\text{dist} = \sqrt{(x_{\text{def}} - x_{\text{ball}})^2 + (z_{\text{def}} - z_{\text{ball}})^2}$$
  * $\text{dist} < 3.2\text{ yards} \implies$ **Pass Broken Up** (Incomplete).
  * $\text{dist} \ge 3.2\text{ yards} \implies$ **Completion** (Spot advances to catch location).
* **Drive Outcomes**:
  * Crossing Line to Gain: Resets to 1st & 10 (target advances +10 yards).
  * End Zone ($\ge 100\text{ yards}$): Touchdown (6 points).
  * 4th Down Incomplete / Short: Turnover on Downs.

---

## 6. Future Expansion Roadmap
* **Phase 2 (PBR & Audio)**: Rigged low-poly glTF/GLB athlete models with idle, scramble, throw, and catch animation clips; spatial 3D audio.
* **Phase 3 (Tactical Playbook)**: Selectable route trees (Flood, Mesh, Four Verticals) and defensive shells (Cover 1 Man, Cover 2 Zone); Touch vs. Bullet passing.
* **Phase 4 (Plajah Platform Integration)**: Sync with Plajah Sports Play & Learn 12-chapter curriculum, private family-safe leagues, and cosmetic uniform/stadium unlocks.

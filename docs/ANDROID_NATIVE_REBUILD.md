# Plajah — Native Android (Kotlin / Jetpack Compose) Rebuild

**Status:** Phase 0 scaffold landed (theme + adaptive shell + toggle + 3 screens).
**Started:** 2026-09-08. **Owner:** Kenne.

A ground-up native front-end for Plajah on Android, built in **Kotlin + Jetpack
Compose + Material 3 / Material You**, running **in parallel** with the existing
Capacitor WebView app. The user toggles between them; Classic (web) stays the
default and fully alive.

---

## Why this is cheap to start

The Android module was already Compose-ready — it just wasn't using Compose for
UI. `android/app/build.gradle` already had `compose = true`, the Compose BOM
(`2025.05.01`), Kotlin 2.1 (K2), Media3, CameraX and edge-to-edge. `MainActivity`
was a thin `BridgeActivity` loading `https://plajah.com`. So the native UI is
*added into the existing module*, no new Gradle project.

---

## Architecture: one design language, two runtimes

```
LAUNCH → MainActivity (Capacitor BridgeActivity, "Classic")
           │  onCreate: if (!TV && ShellPrefs.isNativeEnabled) → NativeActivity, finish()
           ▼
         NativeActivity (ComponentActivity + setContent { PlajahTheme { PlajahApp() } })
```

- **`ui/ShellPrefs.kt`** — persisted flag `plajah_native_shell` (SharedPreferences),
  the native mirror of the web's `useShellNext` localStorage precedent. Default
  **off** (Classic leads). Also holds `plajah_dynamic_tint`.
- **web → native**: `PlajahShellPlugin` (Capacitor) exposes `switchToNative()`.
  Wire a "Switch to Native (beta)" row in the web appearance settings:
  ```ts
  import { registerPlugin } from '@capacitor/core';
  const PlajahShell = registerPlugin('PlajahShell');
  // native platform only:
  await PlajahShell.switchToNative();
  ```
- **native → web**: `NativeActivity.returnToClassic()` flips the flag and relaunches
  `MainActivity`. Exposed in the native Settings sheet ("Switch to Classic (Web)").
- **TV is never redirected** — Fire TV / Android TV keep the D-pad-tuned web
  leanback UI (see `MainActivity.dispatchKeyEvent`).

Both runtimes target the same Firebase backend. The Compose scaffold currently
uses sample data; native authentication and repository integration are still
pending. WebView authentication does not automatically establish a native SDK
session, so account continuity must be implemented and verified before real data
is connected.

---

## Design system port (web → Compose)

The web DS (`styles/plajah-ds.css`, `index.css`, `docs/PLAJAH_DESIGN_SYSTEM.md`)
is ported 1:1 into `ui/theme/`:

| Web token | Compose |
|---|---|
| `--pj-purple/magenta/orange/cyan/lilac` + semantic | `PlajahBrand` (`Color.kt`) |
| `--bg-color`, `--glass-1..5`, `--m3-border*` (dark + light) | `PlajahDark` / `PlajahLight` |
| `--pj-radius-*` (aliased to M3 shapes) | `PlajahRadius` + `PlajahShapes` (`Shape.kt`) |
| `.type-*` scale, `--font-display/body/label` | `PlajahTypography` (`Type.kt`) |
| gradients, glass tiers, semantic, live/spatial | `PlajahColors` via `LocalPlajahColors` (`Theme.kt`) |

**Material You policy — brand-locked, opt-in tint.** `PlajahTheme(dynamicTint)`
folds the wallpaper palette into *neutral surfaces only*; brand-carrying slots
(primary/secondary/tertiary + containers) are forced back to Plajah via
`ColorScheme.withBrandLocked()`. Off by default. Brand identity survives on every
device; surfaces re-theme, the brand does not.

---

## Adaptive: phone → tablet → Android laptop

`PlajahApp` uses one `NavigationSuiteScaffold`. `screenWidthDp` buckets pick both
the nav affordance and content density:

| Width | Nav | Destinations | Content |
|---|---|---|---|
| `< 600dp` | bottom **bar** | 5 primary | single column |
| `600–840dp` | **rail** | all | single column, wider |
| `≥ 840dp` | **drawer** | all | multi-pane (e.g. Lorea two-pane) |

The ≥840 tier is the target for **the new Android laptops (fall 2026)**: drawer
nav, two-pane list/detail, comfortable reading measure, mouse + keyboard. `LoreaScreen`
demonstrates the two-pane split concretely.

Destinations (`ui/nav/Destinations.kt`) each carry their web `AppView` string
(from `types.ts:2860` / `CommandSplitNav.tsx` `NAV_SECTIONS`) so a toggle/deep-link
can hand off to the exact same web screen.

---

## What exists now

```
android/app/src/main/kotlin/com/plajah/app/
  MainActivity.kt          (edited: native handoff + PlajahShell registration)
  NativeActivity.kt        (new: Compose host)
  PlajahShellPlugin.kt     (new: web→native bridge)
  ui/
    ShellPrefs.kt          toggle + prefs
    PlajahApp.kt           adaptive shell + settings sheet
    nav/Destinations.kt    destination model (mirrors AppView)
    theme/                 Color / Shape / Type / Theme
    components/PlajahComponents.kt   Eyebrow, GlassCard, BrandButton, AccentButton, LiveBadge, MediaTile…
    screens/Screens.kt     HomeScreen (Front Row), ChoraScreen, ReelloScreen, LoreaScreen, PlaceholderScreen
```

**Web side (the toggle into native), landed:**
```
services/nativeShell.ts        typed PlajahShell bridge; no-op off native Android
components/NativeShellSwitch.tsx  "Switch to Native app (beta)" card; renders null unless native
components/MobileSettingsMenu.tsx mounts <NativeShellSwitch/> under the profile card
```

Screens beyond Home/Chora/Reello/Lorea render a branded `PlaceholderScreen` —
never a blank — until ported.

### Continuation — 2026-09-08

- Confirmed PR #17 is `feat/kith-sightings`; preserved the existing uncommitted work.
- Added an All destinations menu so secondary surfaces are reachable on phones.
- Selected destination and settings visibility use saved state; Back returns to
  Front Row from a destination while sheets and menus handle their own dismissal.
- Unported surfaces now offer a working Switch to Classic button (opens the
  Classic shell; exact destination handoff is still pending).
- The shell bridge rejects a missing activity and rolls back the native preference
  if launching the activity fails.
- Web development server: `npm run dev`, http://localhost:3000.

---

## Remaining / TODO (in order)

1. ~~**Fonts.**~~ — DONE. Swapped in real Outfit (display/label) + Inter (body)
   via Downloadable Google Fonts (`androidx.compose.ui:ui-text-google-fonts` +
   `font_certs.xml` + `GoogleFont.Provider` in `Type.kt`), falling back to system sans.
2. ~~**Wire the web toggle**~~ — DONE. `services/nativeShell.ts` +
   `components/NativeShellSwitch.tsx`, mounted in the phone Settings menu.
3. **Real data** — replace the sample content in `Screens.kt` with Firestore reads
   (the web services can be mirrored, or exposed to native via a bridge).
4. **Native player** — drive `PlajahMediaService` (Media3) from Compose for Chora
   and Reello: background playback, MediaSession, Cast/Google Home.
5. **Port more screens** — ~~Reello~~ (done), then Feed, Profile, then the long tail.
6. **List/detail multi-pane** for the laptop tier beyond Lorea (Reello, Chora).
7. **Predictive back**, window-size-class-driven type scaling, keyboard shortcuts.

---

## Verifying the build

Verified on 2026-09-08: `:app:assembleDebug` passed (4m 22s), including the
continuation changes above. Output: `android/app/build/outputs/apk/debug/app-debug.apk`.
No device/emulator was connected, so on-device UI and shell switching still need
verification. The web root and both native-switch modules returned HTTP 200 on
the development server.

The initial build downloads the BOM-managed artifacts
(`material3-adaptive-navigation-suite`, `material-icons-extended`). Build in
Android Studio (online), or from PowerShell:

```powershell
cd android
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
.\gradlew.bat :app:assembleDebug
```

(First run downloads the two artifacts from `dl.google.com` — the reason a fully
offline machine can't complete the build.)

A visual mockup of the target UI (phone + Android-laptop) was produced as an
Artifact alongside this scaffold.

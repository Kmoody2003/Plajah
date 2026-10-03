# Windows Design Artifact 01: Platform Shell Parity

Status: parity reference, not a redesign.

The Windows app keeps the live web platform's layout, navigation, route IDs, typography,
and theme tokens. WinUI 3 supplies the window frame, title-bar integration, system menus,
and native OS behaviors around the same web surface.

## Layout

```text
+--------------------------------------------------------------------------------+
| WinUI title bar: Plajah logo  | page title / mini-player | Hello | - [] X       |
+------+-----------------+-------------------------------------------------------+
|      |                 |                                                       |
| rail | Command Split  |                 Existing web route surface                |
|      | sub-navigation |                                                       |
|      |                 |                                                       |
|      |                 |                                                       |
|      |                 |                                                       |
+------+-----------------+-------------------------------------------------------+
|                 Existing player / notifications / overlays                     |
+--------------------------------------------------------------------------------+
```

## Web layout stays identical

- `CommandSplitNav` remains the navigation owner.
- `NAV_SECTIONS`, pinned destinations, command launcher, account switcher, and
  route IDs remain unchanged.
- Existing `App.tsx` content owns the page surface.
- Existing Plajah themes and CSS variables remain the visual authority.
- WebView2 is a host surface, not a second navigation implementation.

## WinUI 3 additions around the layout

| Surface | Web platform | WinUI 3 treatment |
| --- | --- | --- |
| Window chrome | Browser tab/window chrome | Custom title bar with Mica backdrop and native caption buttons |
| Page title | Web page title | Web page posts title to WinUI; native title bar updates |
| Account security | Firebase Auth | Firebase remains identity; Windows Hello verifies local session access |
| Notifications | Web Notification fallback | Windows toast notifications and deep links |
| Playback | Web Media Session | SMTC/taskbar transport controls |
| Links | Browser new window | External links open in default browser; Plajah links stay in-app |
| Keyboard | Browser shortcuts | WinUI receives native system commands without changing web keymaps |
| Files | Browser file picker | WinUI file picker will feed the same web import contracts |

## Tokens to preserve

- Background: `#020202` default, with existing theme overrides.
- Brand ramp: `#6B0099` -> `#D40055` -> `#FF8C00`.
- Fonts: Outfit / Space Grotesk display, Inter / Manrope body, JetBrains Mono technical.
- Existing spacing, rounded surfaces, glass treatment, and page-specific skins.

## Review rule

A Windows feature is accepted only if it wraps or accelerates an existing platform
workflow. It must not create a second Windows-only layout for the same route.

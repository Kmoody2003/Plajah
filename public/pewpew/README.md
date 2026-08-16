# Pew Pew — playable prototypes

Early, self-contained **feel tests** for the live-action shooter (working name Pew Pew).
Not the real game — they test whether the core tempo loop is fun before investing in the
hard native AR localization. Design lives in
`packages/first-party-games/games/live-action/`.

## Files

- **`index.html`** — phone target-practice. Camera passthrough + device-motion aim,
  hold-to-lock (~700ms, tunable), release-to-fire, go-dark when the phone is lowered,
  no-fire-while-moving. Virtual targets anchored in your environment; they fire back on a
  fuse. Pure vanilla JS, no backend, no login, nothing tracked or shared.
- **`xr.html`** — Meta Quest / WebXR build. Aim with the controller ray, **hold the
  trigger** to lock, release to fire. Same tempo; the headset is a render surface, not an
  advantage (ADR-0007). Uses three.js from CDN.

## Why it's target-practice, not real players

Recognising *another player* as a target needs the localization layer — ARCore/ARKit
visual relocalization or UWB — which only exists in the native app, not a web page. So
these prototypes place **artificial targets** in the space to test aim, lock tempo, and
go-dark. Player-vs-player waits for the native build.

## Testing on a phone

Camera + motion sensors require **HTTPS** — a plain `http://<LAN-IP>` link won't grant
them. Two ways:

1. **Durable:** deploy so it's served at `https://<your-domain>/pewpew/`. Firebase serves
   real static files before the SPA rewrite, so this path resolves without touching the app.
2. **Quick (ephemeral):** serve `public/` locally and expose it over an HTTPS tunnel
   (`npx localtunnel --port 8099`). Good for a session, dies when the laptop sleeps.

## Status

Prototype / not user-facing. In-Arcade listing stays admin-gated
(`FIRST_PARTY_LIVE_ACTION`, adminOnly); these prototype URLs are shared directly with
testers, unlisted.

# Plajah TV launch bumpers (bundled)

Drop the opening ident video files in this folder and list their filenames in `manifest.json`:

```json
{ "files": ["ident-01.mp4", "ident-02.mp4", "ident-03.mp4"] }
```

The TV app picks ONE AT RANDOM on every launch and plays it straight from the app bundle — no network
fetch, no streaming — so it starts instantly instead of waiting on the platform library. If this folder
has no manifest (or it's empty), the player falls back to the streamed `TV_OPEN_BUMPER` assets from the
admin Plajah Media Library.

Keep the files short (2–6s), H.264/AAC in an .mp4, ideally ≤1080p so low-power TV boxes decode them
without a hitch.

NOTE: the green Android screen you see BEFORE this plays is the NATIVE splash, drawn by Android while
the WebView boots — it is set in the Capacitor/Android project (splash drawable + theme), not here.
This bumper is the first thing that plays once the web app is alive.

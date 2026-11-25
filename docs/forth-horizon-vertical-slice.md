# Plajah Motorsport Apex — Vertical Slice Architecture (Legends of Elohim)

## Vision
A unified Forza Motorsport (closed-circuit precision) + Forza Horizon (open-world exploration) + multi-domain vehicle simulation (Road → Air → Water → Space) set in **Forth America** within the **Legends of Elohim** universe, powered by **Plajah FM / Chora** for live radio, virtual DJs, and procedural/generative soundtracks.

## Vertical Slice (Phase 1 — Implemented in `games/forth-horizon/`)
- **Engine**: WebGPU + Three.js (`three/webgpu`), ACES Filmic tone mapping, `RoomEnvironment` PBR clearcoat reflections.
- **Shared World + Circuit (`src/world.ts`)**:
  - **Ironport** (Detroit-inspired industrial & art-deco downtown skyline).
  - **West Coast Sand Dunes & Lake Michigan Shoreline** (Great Lakes western coast terrain, bluffs, lighthouse, animated water).
  - **Ironport Grand Circuit** (closed-loop 18m asphalt circuit with red/white kerbs and start/finish gantry, seamlessly embedded in the open world).
  - 3 lighting presets: **Golden Hour**, **Midnight Neon**, **Great Lakes Mist**.
- **Fictional Manufacturers (`src/manufacturers.ts`)**:
  - **Kestrel Motors — Sovereign GT-R** (S1 · 840, Ironport supercharged V8 RWD grand tourer).
  - **Aurelia Works — Zephyr Apex** (S2 · 920, Solari Coast mid-engine V10 AWD track coupe).
- **Arcade-Sim Physics (`src/physics.ts`)**:
  - Speed-sensitive steering, weight transfer (pitch/roll), lateral tire grip with drift slip, 6-speed automatic gearbox, surface friction (`asphalt`, `grass`, `sand`), and 3 AI circuit rivals.
- **Plajah FM / Chora Radio (`src/audio.ts`)**:
  - Imports the live station clock (`onAirNow()`, `nextOnAir()`) and virtual DJ roster (`services/onair/`) so the same on-air hosts (Mari Vega, etc.) appear in-game with live show names, palette accents, and race/milestone DJ callouts.
  - Switchable stations: **Plajah FM (Live Host)**, **Chora · Detroit Techno (128 BPM)**, and **Chora · Great Lakes Synthwave (112 BPM)** alongside procedural dual-oscillator engine & tire screech audio.

## Roadmap (Next Phases)
1. **Phase 2 — Built-in Flight**: Add **Solari Aero-Marine** bush/stunt aircraft & VTOL with aerodynamics (lift, drag, stall, throttle, pitch/roll/yaw) and seamless road-to-air switching from Ironport Airfield over Lake Michigan.
2. **Phase 3 — Water & Space**: Offshore powerboat hydroplane physics on Lake Michigan + orbital/sub-orbital Legends of Elohim craft.
3. **Phase 4 — Persistent Shared World & Chora Audio Streaming**: Multiplayer ghost/session sync + live Chora Direct / Plajah FM audio stream playback.

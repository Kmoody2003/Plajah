# Unity HDRP VFX Graph Specification: Hydraulic Blood Coronet Splash

## Overview
This VFX Graph simulates 2,500 physical blood/obsidian liquid droplets running 100% on the GPU, featuring depth-buffer collision, radial burst dynamics, and quadratic drag.

```
┌────────────────────────────────────────────────────────┐
│               SPAWN CONTEXT (OnKickImpact)             │
│  - Mode: Burst (500 to 2,500 particles based on Kick)  │
│  - Event Hook: SendEvent("OnKickImpact")               │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                  INITIALIZE PARTICLE                   │
│  - Position: Torus Arc (Radius: 0.45m, Thickness: 0.1) │
│  - Velocity: Set Direction (Radial XZ + High Upward Y) │
│    • Speed: Random Range (4.5 to 9.5 m/s)              │
│    • Angle: Cone Angle 35°                             │
│  - Lifetime: Random Range (0.8s to 1.6s)               │
│  - Size: 0.04m to 0.12m with mass-based scaling        │
│  - Color: HDR Crimson (#D40055, Exposure +1.5 EV)      │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                    UPDATE CONTEXT                      │
│  - Gravity: Constant Vector (0, -11.5, 0) m/s²         │
│  - Drag: Quadratic Drag (Coefficient 0.12)             │
│  - Collision: Screen Space Depth Buffer (Plane Y = 0)  │
│    • Mode: Bounce with Roughness (Elasticity: 0.18)    │
│    • On Die at Surface: Spawn Ripple Ring Sub-Spawner  │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                    OUTPUT PARTICLE                     │
│  - Mode: Output Particle Mesh (Subdivided Icosphere)   │
│  - Material: HDRP Physical Mesh (Diffusion Profile)    │
│  - Screen-Space Reflection: Enabled                    │
│  - Cast Shadow: Enabled                                │
└────────────────────────────────────────────────────────┘
```

## HDRP Material Parameters for Droplets
- **Base Color**: `#B8003A` (Deep Crimson)
- **Metallic**: `0.22`
- **Smoothness**: `0.94` (Near-mirror liquid)
- **Diffusion Profile**: `Subsurface Translucent Red`
- **Refraction Model**: `Box Thin` (`IoR = 1.38`)

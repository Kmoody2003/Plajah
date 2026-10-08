# Fabula — 3D Stereoscopic & Spatial AI Workflow
*(Meta Quest, Instagram VR & Google Android XR Native Parity)*

## 1. The Breakthrough: Eliminating "Rubber-Sheeting" Distortion

Previous 2D-to-3D converters operated on raw monocular depth maps alone. When creating the second eye view (disparity offset), pixels at the silhouette boundary between foreground subjects and background scenery stretched and smeared across space like melting rubber ("rubber-sheeting").

Fabula's **Layered Depth Image (LDI) Spatial Engine** solves this by fusing two foundation models:
1. **Depth Anything V2**: Provides metric and relative volumetric continuous depth across the entire scene via WebGPU.
2. **Meta's Segment Anything (SAM / SlimSAM)**: Isolates crisp, sub-pixel silhouette masks of salient foreground characters and objects.
3. **Disocclusion Inpainting (Layer 0)**: When synthesizing stereoscopic parallax, previously occluded background pixels are revealed cleanly using Navier-Stokes edge-diffusion inpainting on the background plate.
4. **Temporal Rigidity (Video)**: Exponential Moving Average (EMA) filtering ensures video clips and Reels do not suffer from flickering or depth-breathing.

---

## 2. Native Workflow in Fabula

### The SPATIAL 3D Suite
In Fabula's footer room rail:
`MEDIA` · `EDIT` · `VFX` · `COLOR` · `AUDIO` · **`SPATIAL 3D`** · `DELIVER`

Inside the **SPATIAL 3D** workspace:
- **One-Click Auto-Convert**: Instant processing using Depth Anything V2 + Meta SAM.
- **Interactive Multi-Mode Monitoring**:
  - **SIDE-BY-SIDE (SBS) 3D**: Standard full/half stereo view for VR headsets.
  - **RED/CYAN ANAGLYPH**: Instant 3D preview with standard stereoscopic 3D glasses on any screen.
  - **DEPTH MAP**: Normalized grayscale & heatmap depth buffer (near = white).
  - **SAM MATTE**: Isolated foreground subject silhouettes.
  - **3D ORBIT**: Interactive camera rotation around the spatial set geometry.
- **Precision Stereoscopic Calibration**:
  - **Convergence Plane ($Z_0$)**: Calibrate what rests flat on the display surface vs. what pops out into the room.
  - **Baseline (IPD)**: Adjust virtual eye separation ($30\text{ mm}$ to $120\text{ mm}$, centered at $63\text{ mm}$ human average).
  - **Depth Relief**: Expand or compress the volumetric 3D stage depth.
  - **Pop-out Boost**: Push the salient character forward beyond the screen plane.
- **Add to Project Pool**: With one click, export the calibrated Side-by-Side (SBS) 3D asset into the project's media pool or place it directly on timeline tracks.

---

## 3. VR Headset Native Experience (Meta Quest & Android XR)

### In-Browser Stereoscopic WebXR
When browsing Plajah's photo feeds (`SpatialMedia`, `GlobalPhotosView`) or Fabula in a VR headset (Meta Quest Browser, Android XR, or Apple Vision Pro):
1. **Ambient Auto-Depth**: Media cards automatically generate depth and salient stratification in the background.
2. **"ENTER 3D VR" Button**: Clicking the headset icon launches an authentic WebXR `immersive-vr` session.
3. **True Dual-Eye Rendering**:
   - Left eye and right eye cameras receive independent perspective viewports with correct ocular disparity ($d = \frac{f \cdot B \cdot (Z - Z_0)}{Z}$).
   - 6DoF head tracking provides realistic look-around parallax into the scene.
   - Strictly conforms to `XR_COMFORT` rules (placed at comfortable 2.5m viewing distance, zero vection, local-floor anchor).

---

## 4. Supported Formats & Delivery

- **Side-by-Side (SBS) 3D MP4**: Universally supported by Meta Quest (Skybox VR, 4XVR, Meta Quest TV, YouTube VR).
- **Spatial Photos**: Embedded disparity channel and dual-channel stereoscopic packages.
- **Red/Cyan Dubois Anaglyph**: For instant client review on standard 2D monitors without headsets.

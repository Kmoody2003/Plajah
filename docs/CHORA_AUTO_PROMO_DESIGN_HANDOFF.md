# Chora Auto-Promo Packages // Technical Design & Implementation Handoff

> **Target Audience:** Autonomous AI Coding Agents & Full-Stack Engineers  
> **System Architecture:** Chora Music Engine + Tela Creative Suite + Motion Graphics & VFX Council  
> **Version:** 2026.4  
> **Status:** Ready for Implementation  

---

## 1. Executive Overview

When an artist uploads an album or single to **Chora**, the platform must autonomously generate a broadcast-grade **Omnichannel Promotional Package** (`PromoPackage`). 

Instead of generic flat graphics or third-party promo tools, this system:
1. Deconstructs the artist's 1:1 cover art using **Google Omni** (multimodal semantic segmentation, 16-bit depth map extraction, lighting analysis) and **Nano Banana 2 Lite** (sub-200ms generative outpainting to 9:16 vertical and 16:9 horizontal).
2. Generates **3 distinct aesthetic packages** designed and vetted by the **Art & Motion Council** (`KINETIC`, `SIGNAL`, `CINEMATIC`, `COMPOSITOR`, `GENERATIVE`, `CHARACTER`).
3. Enforces the **Plajah Dominance Rule**: "AVAILABLE ON PLAJAH CHORA" is the hero CTA and primary lossless stream/purchase link with a dynamic vector QR code; downstream DSPs (Spotify, Apple Music, Tidal, Amazon Music, YouTube Music, Deezer) appear as muted, monochrome micro-badges / "fine print."
4. Packages all deliverables natively as **Tela Document Presets** (`.tela`), allowing artists or managers to tweak layers inside Plajah’s built-in Tela Canvas editor.
5. Integrates directly into **Plajah Postman** for 1-click scheduled social dispatch and streams attribution analytics back to the artist's dashboard.

---

## 2. Plajah Design System & Brand Constraints

Any AI agent implementing this system **must strictly enforce** the following tokens and typography rules:

### 2.1 Typography Stack
* **`Space Grotesk`** (`font-display`): Kinetic headlines, high-impact titles, uppercase monogram stamps, BPM counters.
* **`Bricolage Grotesque`** (`font-expressive`): Harmonic, organic, and editorial luxury headlines.
* **`Inter`** (`font-body`): Clean interface copy, tracklists, metadata, body text.
* **`JetBrains Mono`** (`font-mono-tech`): Technical telemetry, timecodes, catalog IDs (`letter-spacing: 0.16em` to `0.2em`).
* **`Archivo`** (`font-archivo`): Secondary display badges and utility tags.

### 2.2 Brand Color Alchemy Tokens
```typescript
export const PLAJAH_COLOR_ALCHEMY = {
  VOID: '#100B17',      // Deep Cosmic Obsidian Background
  MAGENTA: '#D40055',   // Hyper-Magenta Accent (Kinetic Strobe)
  VIOLET: '#6B0099',    // Royal Plajah Violet (Secondary Shading)
  CYAN: '#00DAF3',      // Electric Plajah Cyan (Primary Technical Accent)
  AMBER: '#FF8C00',     // Solar Amber (Harmonia Warm Light)
  WHITE: '#FAF5FF',     // Luminous Alabaster (Primary Text)
  BG_PRIMARY: '#020202' // Absolute Zero Base
} as const;
```

---

## 3. The 3 Art Council Design Aesthetic Suites

Every release automatically receives all 3 suites generated concurrently:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          CHORA AUTO-PROMO SUITES                                │
├──────────────────────────┬──────────────────────────┬───────────────────────────┤
│ 1. HYPER-KINETIC PULSE   │ 2. HARMONIA / VELVET     │ 3. AVANT-CORP / MONOLITH  │
├──────────────────────────┼──────────────────────────┼───────────────────────────┤
│ Leads: KINETIC + SIGNAL  │ Leads: CINEMATIC + COMP  │ Leads: GENERATIVE + KINET │
│ BPM: 140+ (Trap/EDM/Club)│ Tempo: 70-110 (Soul/R&B) │ Tempo: Any (Experimental) │
│ Visual: Diagonal shear,  │ Visual: Floating vinyl,  │ Visual: Swiss grid,       │
│ RGB chromatic glitch,    │ 35mm shallow DOF, 3200K  │ monospace telemetry,      │
│ laser scanlines, strobe  │ tungsten rim light, film │ wireframe 3D monolith,    │
│ audio-reactive spectrum  │ grain, gatefold pocket   │ FFT frequency histogram   │
│ Palette: VOID, MAGENTA,  │ Palette: VOID, AMBER,    │ Palette: BLACK, CYAN,     │
│ CYAN, ALABASTER          │ WARM GOLD, ALABASTER     │ HAZARD ORANGE, WHITE      │
└──────────────────────────┴──────────────────────────┴───────────────────────────┘
```

### 3.1 15-Second Motion Graphic Bumper Ad Storyboard Structure
*(Renders to 1080×1920 9:16 Vertical for TikTok/Reels and 1920×1080 16:9 Horizontal for YouTube/X at 60fps)*

* **0:00 – 0:04 (Hook 1 // Drop Intro):**
  * Auto-selects Track A's most energetic 5-second window (waveform crest factor analysis via `plajahCouncilAudio()`).
  * Kinetic type intro animating on eighth-beat intervals with overshoot ease curve (`easeOutBack`).
  * Nano Banana 2 Lite outpainted background pulsing to kick transient (50–120 Hz).
* **0:04 – 0:08 (Hook 2 // Melodic Switch):**
  * Hard cut or liquid 3D camera pan to Track B's vocal/melodic hook.
  * Typography moves to title-safe lower-third with live audio VU meter.
* **0:08 – 0:12 (Hook 3 // Climax / Beat Breakdown):**
  * Track C drop with chromatic aberration spike.
  * Album artwork fragments across 3D depth planes based on Google Omni 16-bit depth matte.
* **0:12 – 0:15 (The Plajah Conversion Slate):**
  * Music drops to reverb tail; Plajah signature sonic logo sting fires.
  * Dominant animated Plajah QR Code + "STREAM NOW ON PLAJAH CHORA" badge takes 60% of viewport.
  * Downstream DSP icons (Spotify, Apple, Tidal, Amazon) sit at the bottom edge as 12px monochrome micro-badges.

---

## 4. Google Omni + Nano Banana 2 Lite AI Pipeline

```
[Artist 1:1 Cover Art Image + Lossless Audio Files]
                      │
                      ▼
 ┌─────────────────────────────────────────────────────────┐
 │ STEP 1: Google Omni Multimodal Analysis                 │
 │ - Extracts Subject Mask (Alpha Matte .png)             │
 │ - Extracts 16-bit Monocular Depth Map (Z-Buffer)       │
 │ - Extracts Dominant Key Light Vector & Chromatic Palette│
 │ - Identifies Vocal Formants & Audio Hook Timestamps     │
 └────────────────────────────┬────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────┐
 │ STEP 2: Nano Banana 2 Lite Generative Synthesis         │
 │ - Generates Outpainted 9:16 Canvas (Top & Bottom Fill) │
 │ - Generates Outpainted 16:9 Canvas (Left & Right Fill) │
 │ - Synthesizes Volumetric Ambient Glow & Texture Passes │
 │ - Sub-200ms Execution Time (Zero-Wait User Ingest)     │
 └────────────────────────────┬────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────┐
 │ STEP 3: Art Council Compositing & Layer Sandwiching     │
 │ Layer 0: Nano Banana Outpainted Background Plate        │
 │ Layer 1: Backplane Giant Typography (Behind Subject)    │
 │ Layer 2: Google Omni Segmented Subject + Depth Parallax │
 │ Layer 3: Council Dynamic Clipping Path (Shear/Pocket)   │
 │ Layer 4: Foreground Typography, HUD, Audio Reactive EQ  │
 │ Layer 5: Hero Plajah Badge & Vector Scannable QR Code   │
 │ Layer 6: Micro DSP Footnote                             │
 └─────────────────────────────────────────────────────────┘
```

---

## 5. TypeScript Data Models & Schema (`services/chora/promoTypes.ts`)

```typescript
export type PromoTemplateId = 'kinetic-pulse' | 'harmonia-velvet' | 'avant-monolith';

export interface PromoTrackSnippet {
  trackId: string;
  trackTitle: string;
  artistName: string;
  startTimeSec: number; // e.g., 45.0
  endTimeSec: number;   // e.g., 50.0
  hookType: 'drop' | 'melody' | 'climax' | 'custom';
  audioUrl: string;
}

export interface StreamingPlatformMatrix {
  plajah: {
    isDominant: true;
    exclusive: boolean;
    directUrl: string;
    losslessBitrate: string; // e.g. "24-bit / 192kHz"
  };
  secondaryDSPs: {
    spotify?: string;
    appleMusic?: string;
    tidal?: string;
    amazonMusic?: string;
    youtubeMusic?: string;
    deezer?: string;
    others?: { name: string; url: string }[];
  };
}

export interface OmniMaskData {
  originalCoverUrl: string;
  subjectAlphaUrl: string;
  depthMapUrl: string; // 16-bit grayscale depth
  outpainted9x16Url: string;
  outpainted16x9Url: string;
  dominantColors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  lightAngleDeg: number;
}

export interface PromoAssetBundle {
  templateId: PromoTemplateId;
  motionBumpers: {
    vertical15sMp4Url: string;   // 1080x1920
    horizontal15sMp4Url: string; // 1920x1080
    vertical30sMp4Url: string;
    loopCanvasUrl: string;       // 8s ambient loop
  };
  socialStills: {
    story9x16PngUrl: string;
    postSquare1x1PngUrl: string;
    postPortrait4x5PngUrl: string;
    bannerLandscape16x9PngUrl: string;
  };
  printCollateral: {
    tabloidPoster11x17PdfUrl: string; // 300 DPI CMYK + 0.125" bleed
    collectorCard4x6PdfUrl: string;
    merchPass35x2PdfUrl: string;
    vectorQrSvg: string;              // Custom SVG with center Plajah 'P'
  };
  telaDocumentPresetUrl: string;      // Native .tela document project
}

export interface PromoPackage {
  id: string;
  albumId: string;
  artistId: string;
  createdAt: string;
  status: 'generating' | 'ready' | 'failed';
  selectedSnippets: [PromoTrackSnippet, PromoTrackSnippet, PromoTrackSnippet];
  distribution: StreamingPlatformMatrix;
  omniMask: OmniMaskData;
  suites: Record<PromoTemplateId, PromoAssetBundle>;
}
```

---

## 6. Integration Points with Existing Codebase

### 6.1 Upload Hook: `services/choraUploadQueue.ts`
When an album completes upload processing, trigger the background generator:
```typescript
import { generatePromoPackage } from './services/chora/promoGeneratorService';

export async function onAlbumPublishSuccess(album: ChoraAlbum) {
  // 1. Analyze audio waveforms to locate top 3 energy peaks (crest factor)
  // 2. Dispatch job to Google Omni & Nano Banana 2 Lite
  const promoPkg = await generatePromoPackage({
    albumId: album.id,
    artistId: album.artistId,
    coverArtUrl: album.coverUrl,
    tracks: album.tracks,
    streamingLinks: album.distributionMatrix
  });
  return promoPkg;
}
```

### 6.2 Art Council Personas: `services/motion/council/motionCouncilPersonas.ts`
Hook into the existing 6 council personas (`KINETIC`, `CHARACTER`, `COMPOSITOR`, `GENERATIVE`, `SIGNAL`, `CINEMATIC`) to fetch frame-accurate timing rules and director notes:
* For `kinetic-pulse`: Call `MOTION_PERSONAS.KINETIC` and `MOTION_PERSONAS.SIGNAL`.
* For `harmonia-velvet`: Call `MOTION_PERSONAS.CINEMATIC` and `MOTION_PERSONAS.COMPOSITOR`.
* For `avant-monolith`: Call `MOTION_PERSONAS.GENERATIVE` and `MOTION_PERSONAS.KINETIC`.

### 6.3 Tela Document Engine: `components/tela/TelaView.tsx` & `telaOps.ts`
All 3 suites must be serializable as standard Tela Document JSON trees (`.tela`), allowing the user to click **"Edit in Tela Canvas"** from the promo dashboard to edit text, change fonts, or replace imagery using Plajah’s native vector and layout tools.

### 6.4 Plajah Postman Social Dispatcher: `services/marketing/`
Link the generated `motionBumpers` and `socialStills` to Plajah Postman for scheduled or 1-click social dispatch:
* Multi-account OAuth token pipeline (TikTok, Instagram Graph API, YouTube Data API v3, X API v2).
* Auto-pins the sound to **Plajah Reello** (`types.ts: AppView = 'RELLO'`).
* Injects pre-formatted artist captions with dynamic smart link (`plajah.com/a/[albumSlug]`).

---

## 7. Dynamic Vector QR Code Specification

Print assets require a vector SVG QR code with Plajah's branded center matrix:
1. **Error Correction Level:** `H` (High, 30% recovery capacity) to allow the center monogram overlay without scan degradation.
2. **Center Emblem:** Circular badge with Plajah monogram `"P"` rendered in `Space Grotesk 900`.
3. **Payload URL:** Dynamic redirect tracking URL:
   `https://plajah.com/qr/{releaseId}?src={print_poster|card_4x6|merch_pass}&style={templateId}`
4. **Attribution Engine:** Tracks scan device, timestamp, and geolocation, redirecting the fan directly into the Chora player or app install prompt.

---

## 8. Implementation Checklist for the Next AI

1. [ ] **Create Promo Types:** Implement `services/chora/promoTypes.ts` with the schemas defined above.
2. [ ] **Build Audio Peak Extractor:** Create a waveform crest factor scanner in `services/chora/audioSnippetService.ts` that automatically finds the 3 best 5-second teaser segments (`Hook 1`, `Hook 2`, `Hook 3`).
3. [ ] **Implement Omni & Nano Banana Adapters:**
   * Create `services/ai/omniSegmentationService.ts` to return alpha cutouts and 16-bit depth maps.
   * Create `services/ai/nanoBananaOutpaintService.ts` to generate 9:16 and 16:9 extended backgrounds.
4. [ ] **Build Tela Document Templates:** Create `.tela` document preset generators in `components/tela/presets/promoPresets.ts` for the 3 council movements.
5. [ ] **Build UI Modal:** Integrate the promo suite selector into the Chora album upload wizard, allowing artists to swap the 3 preview tracks, toggle secondary streaming platform checkboxes, and download the full ZIP bundle or edit in Tela.
6. [ ] **Hook Up Plajah Postman:** Wire the 1-click publish button to the existing social media scheduling pipeline.
7. [ ] **Verify Typography & Color Alchemy:** Confirm all visual outputs strictly follow Plajah fonts (`Space Grotesk`, `Bricolage Grotesque`, `Inter`, `JetBrains Mono`) and brand color alchemy.

---

*Handoff Document certified by the Plajah Art Council & Chora Core Team.*

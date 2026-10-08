# Plajah Home // Official Design Specification & AI Prompt Pack

> **Target Audience:** ChatGPT Plus (GPT-4o / Canvas / DALL-E 3), Claude 3.5/3.7, Midjourney, v0 by Vercel, and Human UI/UX Designers.  
> **Source of Truth:** Plajah Design System (`styles/plajah-ds.css`, `docs/PLAJAH_DESIGN_SYSTEM.md`, `components/Logo.tsx`, `index.css`).

---

## 1. The Core Plajah Brand Alchemy

Plajah is **NOT** generic pitch-black, grey, or pastel. It is an **exclusive, high-energy, dark cosmic VIP nightclub / spatial media environment**.

Surfaces can re-theme, but the **Brand Core is theme-invariant**:

| Token | Hex Value | Role & Usage Rule |
| :--- | :--- | :--- |
| **`--pj-purple`** | `#6B0099` | **Primary Brand**. Royal deep violet. Forms the bedrock of the Plajah environment. |
| **`--pj-magenta`** | `#D40055` | **Brand Accent**. High-contrast kinetic partner. Laser outlines, active halos, speed lines. |
| **`--pj-orange`** | `#FF8C00` | **Signal / Action Wire**. Play, live, record, primary eyebrow text, toggle switches. **Rule:** ALWAYS paired with dark contrast text (`#12080a`), NEVER white. NEVER used for "warning". |
| **`--pj-cyan`** | `#00DAF3` | **Spatial / Realtime**. Electric cyan for audio spectrums, live telemetry, lossless audio tags. |
| **`--pj-lilac`** | `#D0BCFF` | **Ethereal / Soft State**. Ambient notes, secondary technical tags, subtle dividers. |
| **`--pj-void`** | `#0d0015` | **Cosmic Base Base**. Deepest purple-tinted obsidian base. |
| **`--pj-ink`** | `#100B17` | **Obsidian Capsule Background**. High-density pill and card base. |
| **`--pj-white`** | `#FAF5FF` | **Luminous Alabaster**. High-contrast primary text. |

### The Five Canonical Gradients

1. **Brand Gradient (`--pj-grad-brand`)**: `linear-gradient(135deg, #6B0099 0%, #D40055 100%)` (Purple to Magenta). Reserved strictly for active scene states and primary CTAs.
2. **Warm Gradient (`--pj-grad-warm`)**: `linear-gradient(135deg, #6B0099 0%, #D40055 55%, #FF8C00 100%)` (Purple → Magenta → Orange).
3. **Ember Gradient (`--pj-grad-ember`)**: `linear-gradient(135deg, #D40055 0%, #FF8C00 100%)` (Magenta to Orange). Energy, live broadcast.
4. **Spatial Gradient (`--pj-grad-spatial`)**: `linear-gradient(135deg, #6B0099 0%, #00DAF3 100%)` (Purple to Cyan). Realtime audio playhead.
5. **Ethereal Gradient (`--pj-grad-ethereal`)**: `linear-gradient(135deg, #D0BCFF 0%, #00DAF3 100%)` (Lilac to Cyan).

### Theme-Plajah Background Formula
```css
background:
  radial-gradient(ellipse 90% 70% at 15% 10%, rgba(107, 0, 153, 0.75) 0%, transparent 60%),
  radial-gradient(ellipse 70% 60% at 85% 85%, rgba(212, 0, 85, 0.60) 0%, transparent 60%),
  radial-gradient(ellipse 55% 45% at 55% 45%, rgba(255, 140, 0, 0.18) 0%, transparent 65%),
  #0d0015;
```

---

## 2. Official Plajah Logo Specification

The Plajah mark is **a single, bold, rounded chevron** drawn with a tri-color linear gradient:

```xml
<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="plajah-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6B0099" />
      <stop offset="50%" stop-color="#D40055" />
      <stop offset="100%" stop-color="#FF8C00" />
    </linearGradient>
  </defs>
  <path
    d="M30 20 L70 50 L30 80"
    stroke="url(#plajah-logo-grad)"
    stroke-width="18"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
```
* **Shape**: A thick `>` chevron pointing right (start at `30, 20`, apex at `70, 50`, return to `30, 80`).
* **Stroke**: 18px width, fully rounded caps and joins (`stroke-linecap="round" stroke-linejoin="round"`).
* **Gradient Ramp**: Starts at deep Royal Purple (`#6B0099`), passes through Hyper-Magenta (`#D40055`), and finishes in Solar Orange (`#FF8C00`).

---

## 3. Typography Hierarchy

* **Display Headlines**: **`Space Grotesk`** (architectural, wide-stance, high impact, weights 700/900). Used for page titles and room names.
* **Technical Telemetry**: **`JetBrains Mono`** (monospace, `0.14em` to `0.28em` tracking). Used for status badges, temperature, latency, IP addresses, bitrates.
* **Interface Body**: **`Inter`** (neutral, ultra-legible over glass).
* **The Signature Eyebrow**: `text-[10px] font-mono uppercase tracking-[0.28em] text-[#FF8C00] font-bold`.

---

## 4. Architectural Layout: The 3-Column Command Bridge

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [LOGO] PLAJAH HOME        HEARTH // MASTER CONTROL          [72.4°F] [BROADCAST INTERCOM] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ USER ACCOUNT BAR:  [Avatar] Kenny (PLAJAH+ CREATOR)  • 42GB/100GB • 3 UNREAD NOTES     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENES: [🎬 CINEMA PRO]  [01 // STUDIO PRO]  [02 // STUDY FOCUS]  [03 // NIGHTFALL]    │
├──────────────────────────┬──────────────────────────┬──────────────────────────────────┤
│ 1. LIVE MATTER CAMERAS   │ 2. ROOMS & ATMOSPHERE    │ 3. REPURPOSED & WEBRTC DESKTOP   │
│                          │                          │                                  │
│ • Front Door 4K Cam      │ • Living Room Studio     │ • WebRTC Remote Workstation      │
│   - Live video preview   │   - Cyan audio EQ bars   │   - Live Windows 11 screen       │
│   - "Motion 2m ago"      │   - 24-bit/192kHz Chora  │   - "12ms P2P Latency"           │
│   - [2-Way Mic] [Unlock] │   - Volume rotary dial   │   - [Connect Now] button         │
│                          │                          │                                  │
│ • Studio Workshop Cam    │ • Kitchen Hub (72.0°F)   │ • Repurposed Hardware Fleet:     │
│   - Interior night mode  │ • Academia Study Lab     │   - Dell Inspiron (Smart Disp)   │
│                          │   - Junior 5th Gr Math   │   - iPad Air (Kitchen Ctrl)      │
│                          │   - 65% progress bar     │ • DLNA Digital Picture Frame     │
├──────────────────────────┴──────────────────────────┴──────────────────────────────────┤
│ DOCKED CHORA PLAYER: [Art] Midnight City - M83  [Cyan Waveform] [Orange Play] [Aria Orb]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Ready-to-Paste Prompt for ChatGPT / DALL-E / Claude / Canvas

Copy and paste the exact prompt below into ChatGPT, Claude, Midjourney, or v0:

```markdown
Generate a high-fidelity, production-grade UI design for "Plajah Home" — a next-generation smart home controller and command bridge app.

STRICT DESIGN SYSTEM RULES (DO NOT DEVIATE):
1. COLOR PALETTE:
   - Base background: Deep cosmic obsidian void (#0d0015) with rich dual radial glows: royal purple (rgba(107,0,153,0.75)) in the top-left, hyper-magenta (rgba(212,0,85,0.60)) in the bottom-right, and subtle solar orange (rgba(255,140,0,0.18)) in the center.
   - Glass surfaces: Translucent dark purple (rgba(26,0,38,0.50)) with 16px blur and crisp hairline hyper-magenta borders (rgba(212,0,85,0.30)).
   - Brand Triad: Royal Violet (#6B0099), Hyper-Magenta (#D40055), and Signal Orange (#FF8C00).
   - Accents: Electric Cyan (#00DAF3) for audio waves & lossless telemetry; Lilac (#D0BCFF) for secondary tags; Mint Green (#06D6A0) for secure/online status.
   - Contrast Rule: Orange (#FF8C00) buttons MUST have dark text (#12080a), never white. Orange is for actions, NEVER for warning.

2. OFFICIAL PLAJAH LOGO:
   - A single, thick, rounded chevron mark (pointing right '>') rendered with a vibrant linear gradient from #6B0099 (top) -> #D40055 (middle) -> #FF8C00 (tip), housed in an obsidian capsule with "PLAJAH HOME" typography.

3. TYPOGRAPHY:
   - Space Grotesk for architectural titles and room names.
   - JetBrains Mono for telemetry, status badges, temperatures, and 0.28em-tracked uppercase orange eyebrows: "PLAJAH // HOME CONDUCTOR OS".

4. LAYOUT HIERARCHY:
   - Top Header: Plajah gradient chevron logo, Space Grotesk title "HEARTH // MASTER CONTROL", live telemetry badge "[18 MATTER NODES // 72.4°F]", and a solid Signal Orange pill button "BROADCAST INTERCOM" with dark text.
   - User Account Insight Bar: Kenny's avatar with purple/magenta gradient halo, "PLAJAH+ CREATOR" badge, storage bar "42GB / 100GB USED", "3 UNREAD ACADEMIA NOTES", and "STUDIO: $890/MO".
   - Scene Ribbon: Horizontal pills with "CINEMA PRO" active in purple-to-magenta gradient with a laser outline, alongside "[01 // STUDIO PRO]", "[02 // STUDY FOCUS]", and "[03 // NIGHTFALL]".
   - Main 3-Column Bridge:
     * Col 1: LIVE MATTER CAMERAS: "Front Door // 4K Matter Cam" with live video preview, "Motion 2m ago" pill, and overlaid glass buttons for "2-WAY AUDIO MIC" and "UNLOCK DOOR".
     * Col 2: ROOMS & ATMOSPHERE: "Living Room Studio" with electric cyan audio visualizer bars & volume dial; "Kitchen Hub" with 72.0°F readout; "Academia Study Lab" showing student progress ("Junior studying 5th Gr Math", 65% progress bar, warm 3200K focus light toggle).
     * Col 3: REPURPOSED HARDWARE & WEBRTC: Interactive "Workstation (WebRTC)" tile streaming a Windows 11 desktop to an Xbox One TV with "[12ms P2P LATENCY]" badge; device status list for old Dell Inspiron and iPad; and a DLNA Digital Picture Frame card.
   - Bottom Dock: Docked Chora Lossless Player with album art, "Midnight City — M83", electric cyan audio wave, solid orange play button, and Aria AI's glowing spectral starburst orb.

Visual Aesthetic: Cyber-lounge luxury, ultra-clean vector precision, high-contrast neon outlines, zero washed-out pastels, zero generic flat grey.
```

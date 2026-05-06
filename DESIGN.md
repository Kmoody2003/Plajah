---
colors:
  bg:
    default: "#020202"
    light: "#f8fafc"
    pastel: "#fdf6e3"
    plajah: "#1a0026"
    big-screen: "#00050a"
    phone: "#000000"
    ethereal: "#131314"
    citrus: "#0f0500"
  textPrimary:
    default: "#ffffff"
    light: "#0f172a"
    pastel: "#2aa198"
    plajah: "#ffffff"
    big-screen: "#ffffff"
    phone: "#ffffff"
    ethereal: "#e5e2e3"
    citrus: "#ffffff"
  textSecondary:
    default: "#ff8c00"
    light: "#ff8c00"
    pastel: "#073642"
    plajah: "#ff8c00"
    big-screen: "#3b82f6"
    phone: "#ff8c00"
    ethereal: "#ffb68d"
    citrus: "#ff5500"
  accent:
    default: "#ffffff"
    light: "#ff8c00"
    pastel: "#2aa198"
    plajah: "#d40055"
    big-screen: "#3b82f6"
    phone: "#ff8c00"
    ethereal: "#d0bcff"
    citrus: "#ffaa00"
  cardBg:
    default: "rgba(255, 255, 255, 0.02)"
    light: "rgba(255, 255, 255, 0.4)"
    pastel: "#eee8d5"
    plajah: "rgba(107, 0, 153, 0.15)"
    big-screen: "rgba(255, 255, 255, 0.08)"
    phone: "#050505"
    ethereal: "rgba(53, 52, 54, 0.4)"
    citrus: "rgba(255, 85, 0, 0.05)"
  border:
    default: "rgba(255, 255, 255, 0.05)"
    light: "rgba(0, 0, 0, 0.05)"
    pastel: "rgba(7, 54, 66, 0.1)"
    plajah: "rgba(212, 0, 85, 0.2)"
    big-screen: "rgba(255, 255, 255, 0.15)"
    phone: "rgba(255, 255, 255, 0.1)"
    ethereal: "rgba(73, 68, 84, 0.2)"
    citrus: "rgba(255, 85, 0, 0.15)"

typography:
  fonts:
    display: "'Outfit', 'Space Grotesk', sans-serif"
    headline: "'Outfit', 'Noto Serif', serif"
    body: "'Inter', 'Manrope', sans-serif"
    label: "'Outfit', 'Manrope', sans-serif"
    mono: "'JetBrains Mono', monospace"
    handwritten: "'Gochi Hand', cursive"

radii:
  3xl: "28px"
  4xl: "36px"

shadows:
  media-lift-default: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
  media-lift-hover: "0 30px 60px -12px rgba(0, 0, 0, 0.5), 0 18px 36px -18px rgba(0, 0, 0, 0.6)"
  ethereal-glow: "0px 20px 40px rgba(0, 0, 0, 0.4), 0 0 15px rgba(208, 188, 255, 0.08)"
  spatial-glow: "0 0 20px rgba(34, 211, 238, 0.4)"

motion:
  transitions:
    media-lift: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
    media-lift-hover: "transform 0.25s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.25s cubic-bezier(0.2, 0, 0, 1)"
  keyframes:
    music-bar: |
      0%, 100% { height: 20%; }
      50% { height: 100%; }

glassmorphism:
  blur: "12px"
  saturate: "180%"
  light-blur: "16px"
  citrus-blur: "24px"
  ethereal-blur: "20px"
---

# Look & Feel

Vibestream represents a multi-modal, highly sensory application environment characterized by themes that drastically alter the mood of the interface. The design intent focuses heavily on **immersion, multi-theming, and spatial interactions**.

## Theming Strategy
The system embraces **dramatic visual themes** over subtle palette swaps. It leverages heavy background filtering, backdrop blurring, and intense CSS effects:
* **Dark (Default)**: Deep blacks (`#020202`) with sheer, barely visible borders. Accentuated with a stark, vibrant orange (`#ff8c00`) meant to slice through the dark.
* **Light**: Frosted, highly saturated glass (`backdrop-filter: blur(16px) saturate(180%)`) layered over a radial gradient background simulating soft, airy paper.
* **Pastel**: Mimics physical scrapbooking with handwritten fonts (`Gochi Hand`), faux notebook stitching, polaroid-style image treatments with slight randomized rotations, and "nano banana" yellow tape elements overlaying content.
* **Plajah**: A deep purple environment (`#1a0026`) that feels like an exclusive, dimly lit nightclub or VIP space, with high-contrast magenta (`#d40055`) and orange accents.
* **Ethereal**: Soft, heavenly, and heavily blurred with an aurora-style linear gradient background and ambient glowing shadows.
* **Citrus**: Uses a dark radial orange/black gradient (`#0f0500`) with a highly interactive, simulated kinetic fluid system (water droplets). The theme heavily layers frosted glass with high saturation to produce an intensely vibrant, wet aesthetic.

## Typography
* **`Outfit` / `Space Grotesk`** are utilized for stark, architectural headings. The design relies heavily on tracking adjustments—specifically `tracking-tightest` for massive display text and `tracking-[0.5em]` for tiny, hyper-technical eyebrow text.
* **`Inter`** grounds the body, offering extremely legible, stable reading against complex backgrounds.
* **`Gochi Hand`** is selectively applied in the Pastel theme to evoke personal, handwritten marginalia.

## Interaction & Spatial Presence
* **Media Lift**: Hover states across the application do not just lighten in color. They execute a dramatic physical lift (`transform: translateY(-12px) scale(1.02)`) over `0.8s` with a pronounced shadow, conveying weight and momentum.
* **Spatial Depth**: The system utilizes a conceptual Z-axis (`perspective: 2000px`), pulling "front" elements forward by `50px` while receding "back" layers by `-100px` and blurring them slightly, providing true layered depth mimicking mixed-reality interfaces.
* **Generative Physics**: The interface is not static; it responds to cursor presence with physics-based distortions and fluid dynamics, especially apparent in the interactive water droplet system in the Citrus theme which calculates mass, friction, and user cursor velocity.

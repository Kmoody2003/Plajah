# FX preview images

Drop image files here to use as the source scene behind every FX / filter
preview in the Fabula FX library (replacing the synthetic test pattern).

- **Formats:** `.jpg` `.jpeg` `.png` `.webp` `.avif`
- **Picked up automatically** — no code change. `previewScene.ts` globs this
  folder; the first file (alphabetical) is the primary scene, a second becomes
  the "incoming" frame for transition previews.
- **What reads well:** a photograph with faces / skin tones, saturated colour,
  bright highlights and deep shadows, and some fine detail or text — that's
  where a grade, blur, glow, key, or stylise effect shows its character.
- **Aspect / size:** tiles are 192×108 (16:9); a landscape image ≥1280×720
  crops cleanly. Two contrasting scenes make transition previews obvious.

With no images here, previews fall back to the built-in synthetic pattern.

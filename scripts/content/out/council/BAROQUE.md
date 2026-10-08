# BAROQUE, the Baroque Dramatist

## 1. Direction
**"The Lit Page"**: every lesson is a stage with one source of light. The accent colour is that light; the page is a dark room where the idea being taught is the thing the light falls on, and every callout is a small, timed entrance.

## 2. Typography
- Body: a serif with real contrast and optical sizes, loaded from Google Fonts: **Newsreader** (or Source Serif 4) at 18px phone / 20px desktop, line-height 1.65, measure 62ch. Text colour off-white (#E9E4DA on #0E0D12), AA or better.
- Display (title card, callout labels): **Fraunces** at high optical size, soft/wonk axes off for 12+, on for 4-7.
- Numerals: oldstyle in prose (`font-variant-numeric: oldstyle-nums`), lining and tabular in math and data.
- Small caps (`font-variant-caps: all-small-caps`, letterspaced 0.06em) for callout labels, track name and lesson number.
- Drop cap on the first paragraph only: 3 lines, accent-tinted, display face, with a faint radial glow behind it. Skipped when the first word is a numeral or symbol, or when Large Text is on.
- Dyslexia option swaps body to Atkinson Hyperlegible, turns off drop cap, small caps and italics-for-emphasis (uses weight), and widens spacing.

## 3. Layout and pacing
Anatomy, top to bottom:
1. **Title card**: lesson number as a large outlined numeral, title, track in small caps, a single accent light-pool (radial gradient, 20% opacity) behind the title, off-centre.
2. **Opening**: first paragraph set larger (1.15x) with the drop cap. This is the "overture".
3. **Body**: paragraphs with generous 1.4em rhythm. Every 3rd-4th paragraph gets extra air above it (a "beat"), computed from sentence count so the page breathes where the argument turns.
4. **Callouts** break the column (see 4), at most one per ~120 words so the page never becomes a catalogue.
5. **Margin notes** (desktop): connections and tradition panels dock beside the paragraph that mentions them; on phone they collapse to a tap-to-open footnote mark.
6. **Curtain**: last paragraph followed by a short rule and "mark as understood".
Progress: a thin accent filament along the left edge that brightens as you read (not a bar with a percentage).

## 4. Callouts (detected by paragraph prefix)
Each is a **lit box**: label in small caps, a 3px accent edge, and a lighting change, never an emoji.
- **Worked example**: recessed panel, darker than the page, accent edge on the left, monospaced or tabular numerals, steps numbered automatically if the text has sentences separated by "Then/Next". Feels like a stage cutaway.
- **Why it matters**: the brightest block on the page. Wider than the column, serif italic at 1.1x, a warm light rising from beneath. The emotional peak.
- **Trap**: cooler, desaturated amber edge with a diagonal hatched corner; text slightly tighter. A warning in the wings.
- **Try this**: raised card with an accent outline and a visible tap target ("Done"). Feels like being handed a prop.
- **Example / Everyday example**: a quiet indent with an accent quotation-style hairline; the lowest-energy callout.
The label words stay in the text (not stripped), so screen readers and plain-text copies lose nothing.

## 5. Image and ornament
Rules: ornament must be structural (it marks a change of state) or it is removed.
- **Generated**: accent colour, light-pool position (seeded from lesson id so each lesson has a different but stable angle of light), numeral, track label, dividers, drop-cap glow, callout chrome.
- **Dividers**: a rule with a small central lozenge that is faintly drawn by an SVG stroke whose wobble is seeded per lesson.
- **Hand-authored (optional layer)**: per-course frontispiece plate (engraving, drawing or photo), per-lesson pull quotes, marginalia, diagram overrides. Course JSON `presentation: { frontispiece, motifs, tone }`.
- No texture overlays on text; any grain stays behind the panel and under 6% opacity.

## 6. Interaction and motion
- Reveal: callouts fade/rise 8px and the light behind them brightens over 350ms as they enter the viewport; once, never repeating.
- Read-aloud: the current sentence is lit (accent underline and full-brightness text) while others dim to 70%, and the page scrolls to keep it in the lower third.
- Hover/focus: callouts lift subtly; focus rings are a 2px accent outline, always visible.
- Notes: select text to add a margin note; stored per learner.
- "Mark as understood": the filament flares once and the title numeral fills in.
- `prefers-reduced-motion`: all reveals become instant, light stays static; no scroll hijack ever.

## 6b. Scaling
- **4-7**: 24px body, 1.8 line-height, measure 40ch, one sentence per line group, big drop cap, light is warmer and the lit box is the only callout style (all collapse to "Look!" / "Try!"). Read-aloud on by default. Max one ornament per screen.
- **8-11**: 20px, callouts keep their names, bigger icons-as-shapes, short reveal.
- **12-15**: default spec above.
- **16-adult**: tighter 17px, 70ch, margin notes and footnotes, minimal animation, more tabular detail.
- **Subject**: art/design lets the frontispiece dominate and the light follow the image; history gets a timeline filament and place/date small caps; math gives Worked example the stage and numbers tabular; music adds a notated bar rule as divider and lights the beat in read-aloud; science favours Trap.

## 7. Human source trace
Light has a source and the source is a decision: the angle is seeded but each course can hand-set it. The drop cap and numeral use slightly irregular glow shapes, rules are drawn with a stroke wobble, callout labels are in a hand-set display face, and authored plates carry a visible "drawn by" credit. Timing is staggered by sentence length, as a speaker would pause.

## 8. Strongest disagreement
The **Radical Minimalist**: "remove until only the thing that matters can." Often that is an alibi for not deciding what the lesson feels like; a grey page tells a 5-year-old and a Schenker reader the same thing, which is nothing. I would steal their **sentence-count discipline**: the one-callout-per-120-words cap and the rule that anything unearned is deleted.
(Also opposed on the other axis: the **Futurist** wants a rule; I want a decision. Timing is a choice, not a parameter.)

## 9. Risk
Theatre becomes noise: lit boxes on every lesson flatten into wallpaper, the glow reads as AI-sheen, and animated reveals slow fast readers. Mitigation: the one-per-120-words cap, a Calm setting that disables the light and reveals, and a rule that hand-authored plates replace the generated light wherever they exist.

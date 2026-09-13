# Plajah Design System

**Tokens:** [`styles/plajah-ds.css`](../styles/plajah-ds.css)
**Primitives:** [`components/ui/`](../components/ui)
**Layout / type / motion:** [`src/lib/designSystem.tsx`](../src/lib/designSystem.tsx)
**Themes + type scale + glass:** [`index.css`](../index.css)
**Mood board:** [`DESIGN.md`](../DESIGN.md)

---

## Platform rule: menus open in view

Every dropdown and submenu must open beside its actual trigger or parent row and remain inside the visible viewport. This applies across Chora and every other platform surface.

- Use `useContextMenu` for command menus and nested commands. Use `AnchoredPopover` for custom dropdown content. Both render outside transformed and overflow-clipped ancestors.
- Measure the exact trigger in viewport coordinates before showing content. Never fall back to `(0, 0)`, the document top, a stale highlighted row, or a guessed parent item when an anchor is missing.
- Flip at viewport edges; constrain oversized menus and scroll their contents. Account for the visual viewport on zoomed/mobile layouts.
- Menu scrolling and focus restoration must not jump the page. Keyboard navigation must reveal the active row within the menu.
- New or changed custom menu surfaces must use these primitives or provide equivalent browser regression coverage for scrolled/transformed parents, nested menus, viewport edges and constrained screens.

Regression harness: `node scripts/verifyMenuPosition.mjs`.

---

## Why this exists — the audit

Measured across `components/**/*.tsx` on 2026-08-12:

| Symptom | Count |
|---|---|
| Raw `<button>` tags | **5,136** |
| Distinct `px-* py-*` padding combinations | **25+** (top: `px-3 py-2` ×494, `px-4 py-2` ×385, `px-3 py-1.5` ×356, `px-4 py-3` ×353…) |
| Distinct corner radii in use | **20** (`rounded-full` ×3,767, `rounded-xl` ×2,608, `rounded-2xl` ×2,608, plus `rounded-[2rem]`, `[2.5rem]`, `[1.75rem]`, `[1.4rem]`, `[1.1rem]`, `[2.8rem]`…) |
| Hardcoded hex colours | **6,984** (`#FF8C00` ×1,414, `#6B0099` ×326, `#D40055` ×236…) |
| Shared UI primitive components | **0** — no `components/ui/`, no `Button` |

The diagnosis is not "bad taste." The platform already had good bones: an M3
shape scale, a fluid `.type-*` scale, five glass layers, `TYPE`/`MOTION`
presets, `.tap` touch targets. **What was missing was a control layer and
anything that made using the tokens easier than not using them.** With no
`<Button>`, every screen re-invented one, and 5,136 independent decisions drifted.

This system adds the missing layer. It does not replace what worked — the new
radius tokens alias directly onto `--m3-shape-*`, and `components/ui` re-exports
`TYPE`/`MOTION`/`Container` so there is one import path.

---

## 1. Colour

### Brand — theme-invariant

Surfaces re-theme across all nine themes. **The brand does not.**

| Token | Value | Meaning |
|---|---|---|
| `--pj-purple` | `#6B0099` | Primary brand |
| `--pj-magenta` | `#D40055` | Brand accent |
| `--pj-orange` | `#FF8C00` | Signal / action — play, live, record |
| `--pj-cyan` | `#00DAF3` | Spatial, realtime |
| `--pj-lilac` | `#D0BCFF` | Ethereal, soft states |

Soft variants for fills: `--pj-purple-soft`, `--pj-magenta-soft`, `--pj-orange-soft`, `--pj-cyan-soft`.
Tailwind: `bg-brand-purple`, `text-brand-orange`, `border-brand-magenta`, …

### Semantic — status only

`--pj-success` `#06D6A0` · `--pj-warning` `#F59E0B` · `--pj-danger` `#EF4444` · `--pj-info` `#3B82F6`
(+ `-soft` variants). Tailwind: `text-state-success`, etc.

> **Rule:** never use a semantic colour for decoration, and never use a brand
> colour to mean success or error. Orange is Plajah's *action* colour, not a warning.

### Surface — theme-reactive

These already existed and remain the source of truth. Do not hardcode past them.

`--bg-color` · `--text-primary` · `--text-secondary` · `--card-bg` · `--border-color`
· `--glass-1…5` · `--m3-border` / `--m3-border-strong` · `--on-surface-variant`

---

## 2. Gradients

Five. `from-[#6B0099] to-[#D40055]` appears inline dozens of times — that is
`--pj-grad-brand`. Use the token.

| Token | Ramp | Use |
|---|---|---|
| `--pj-grad-brand` | purple → magenta | Primary CTA, featured borders |
| `--pj-grad-warm` | purple → magenta → orange | Hero / marketing surfaces |
| `--pj-grad-ember` | magenta → orange | Energy, live, sport |
| `--pj-grad-spatial` | purple → cyan | Spatial audio, realtime, Pixels |
| `--pj-grad-ethereal` | lilac → cyan | Calm surfaces (Ora, Ethereal theme) |

Plus scrims — the correct fix for unreadable text over artwork, instead of a
one-off `bg-black/40`: `--pj-scrim-bottom`, `--pj-scrim-top`.

Gradient text: `.pj-text-brand`, `.pj-text-ember` (handles the four `background-clip`
properties Safari needs).

---

## 3. Shape

Twenty radii collapse to seven, aliased onto the existing `--m3-shape-*` scale.

| Token | px | Role |
|---|---|---|
| `--pj-radius-xs` | 8 | Tags, code, tiny inline marks |
| `--pj-radius-sm` | 12 | Chips, small inputs |
| `--pj-radius-md` | 16 | Square controls, text inputs |
| `--pj-radius-lg` | 24 | **Cards** |
| `--pj-radius-xl` | 28 | **Sheets, modals, drawers** |
| `--pj-radius-2xl` | 36 | Hero panels, full-bleed features |
| `--pj-radius-full` | ∞ | **Controls (default), avatars, chips** |

Tailwind aliases: `rounded-control`, `rounded-card`, `rounded-sheet`, `rounded-hero`.

**Rule of thumb:** the larger the surface, the larger the radius. A pill-shaped
button inside a 24px card inside a 28px sheet reads as a coherent nesting;
`rounded-3xl` on a 32px button does not.

---

## 4. Controls — the button fix

Every control picks **one row** of this table. Height is fixed, so buttons on a
row align whether they hold an icon, a label, or both.

| Size | Height | Padding-x | Gap | Icon | Type | Use |
|---|---|---|---|---|---|---|
| `xs` | 28px | 10 | 4 | 12 | label-sm, uppercase | Dense metadata rows, overlay chips |
| `sm` | 34px | 14 | 6 | 14 | label-md, uppercase | Toolbars, card actions |
| `md` | 42px | 18 | 8 | 16 | label-lg | **Default** |
| `lg` | 50px | 24 | 10 | 20 | title-md | Page-level primary action |
| `xl` | 60px | 32 | 12 | 24 | title-lg | Hero CTA, TV, kiosk/POS |

`xs` and `sm` fall below the 44px comfortable hit area, so `<Button>` adds `.tap`
to them automatically — the visual size is unchanged, the touch target is not.

### Variants — weight, not decoration

| Variant | Appearance | Use |
|---|---|---|
| `primary` | Brand gradient + glow | **One per view.** The thing you want them to do. |
| `accent` | Solid orange | Play / go live / record — the platform's signal action |
| `secondary` | Glass + hairline | The workhorse. Re-themes automatically. |
| `outline` | Border only | Same weight as secondary, less fill |
| `ghost` | Transparent | Toolbars, dense rows, dismissals |
| `danger` | Solid red | Destructive and prominent |
| `danger-quiet` | Red tint | Destructive inside a dense list |
| `success` | Green tint | Confirmed / verified states |

> Three gradient buttons on one screen means two of them are lying about their
> importance. Exactly one `primary` per view.

### Usage

```tsx
import { Button, IconButton, Surface, Actions, Input, Chip } from '../components/ui';

<Button variant="primary" size="lg" icon={<Play />}>Play</Button>
<Button variant="secondary" loading>Saving</Button>
<Button as="a" href="/chora" variant="outline" iconRight={<ArrowRight />}>Open Chora</Button>
<IconButton variant="ghost" size="sm" aria-label="Close"><X /></IconButton>
```

Behaviours you get for free, each of which is a bug class in the current code:

- `type="button"` by default — no more accidental form submits.
- Icons auto-sized to the control scale; never set width/height on them.
- `loading` swaps the icon for a spinner and disables the control **without
  changing width**, so rows do not reflow mid-save.
- One focus ring (`--pj-focus-ring`), shared by keyboard, screen readers and TV
  D-pad navigation.
- `prefers-reduced-motion` respected.
- `:active` scale, `:disabled` opacity, and hover states are consistent everywhere.

Non-React surfaces (TV shells, injected HTML, OG/email templates) use the raw
classes for identical geometry: `.pj-btn .pj-btn--primary .pj-btn--lg`.

---

## 5. Surfaces & elevation

Plajah is dark and translucent, so elevation reads as **shadow depth + glass
opacity together**, never as a lighter grey. `<Surface level>` moves both.

| Level | Glass | Shadow | Use |
|---|---|---|---|
| 1 | `--glass-1` | `--pj-elev-1` | Resting card |
| 2 | `--glass-2` | `--pj-elev-2` | Raised card, hover |
| 3 | `--glass-3` | `--pj-elev-3` | Floating panel, popover |
| 4 | `--glass-4` | `--pj-elev-4` | Drawer, docked player |
| 5 | `--glass-5` | `--pj-elev-5` | Modal over content |

```tsx
<Surface level={3} shape="sheet" brand>…</Surface>
```

Brand glows (`--pj-glow-brand`, `--pj-glow-orange`, `--pj-glow-cyan`) are for the
primary CTA and live/on-air states **only**. If everything glows, nothing does.

---

## 6. Typography

Already canonical in `index.css` + `TYPE`. Unchanged; restated for completeness.

| Family | Token | Role |
|---|---|---|
| Outfit / Space Grotesk | `--font-display` | Display + headlines, architectural |
| Outfit / Manrope | `--font-label` | Labels, buttons, titles |
| Inter / Manrope | `--font-body` | Body — legible over complex art |
| JetBrains Mono | `--font-mono-tech` | Technical, timecode, data |
| Gochi Hand | `--font-handwritten` | Pastel theme only |

Roles: `display-lg/md/sm` → `headline-lg/md/sm` → `title-lg/md/sm` →
`body-lg/md/sm` → `label-lg/md/sm`, fluid via `clamp()`.
Use `TYPE.headlineLg` or the `.type-headline-lg` class — never a raw `text-[2rem]`.

`.pj-eyebrow` codifies the platform's most recognisable typographic gesture: the
tiny 0.28em-tracked uppercase label above a section title.

---

## 7. Spacing & rhythm

4px base: `--pj-space-1…20`. Helpers that remove one-off margin soup:

- `.pj-stack` / `.pj-stack-2` / `.pj-stack-6` — vertical rhythm between children
- `.pj-row` — horizontal flex row, 12px gap, centred
- `.pj-actions` / `<Actions>` — canonical dialog footer. Primary action **last**
  in DOM order; on ≤480px it reverses and stretches so mobile gets the primary
  on top, full width. This is also the fix for inconsistent button *positioning*.

---

## 8. Motion

`--pj-ease-standard` `cubic-bezier(0.2,0,0,1)` · durations `--pj-dur-fast` 120ms /
`--pj-dur-base` 200ms / `--pj-dur-slow` 300ms / `--pj-dur-slower` 500ms.

These mirror `MOTION` in `src/lib/designSystem.tsx` so CSS transitions and
`motion/react` springs agree. Signature moves — Media Lift, spatial depth,
generative physics — stay documented in `DESIGN.md`; they are expressive
flourishes, not defaults.

---

## 9. Migration

**Do not mass-rewrite 5,136 buttons.** That is an enormous, un-reviewable,
un-previewable diff across TV code that cannot be visually verified — exactly
the failure mode that has bitten this codebase before.

**Rules going forward**

1. All new UI uses `components/ui`. No new raw `<button>`.
2. When you touch a screen for any other reason, convert the controls in that
   screen. Opportunistic, reviewable, one surface at a time.
3. No new hardcoded hex. If a colour is missing, add a token.
4. No new arbitrary radii (`rounded-[2.3rem]`). If a shape role is missing, add one.

**Suggested conversion order** (highest visibility first):
Chora player & track rows → Reello/Taleo TV shells (D-pad focus ring consistency
matters most here) → composer / upload flows → Academia & Elevate portals →
settings and admin.

**Common replacements**

| Before | After |
|---|---|
| `<button className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white text-xs font-black uppercase">` | `<Button variant="primary" size="sm">` |
| `<button className="px-3 py-1.5 rounded-full bg-white/10 …">` | `<Button variant="secondary" size="sm">` |
| `<button className="p-2 rounded-full hover:bg-white/10">` | `<IconButton variant="ghost" size="sm" aria-label="…">` |
| `text-[#FF8C00]` | `text-brand-orange` |
| `rounded-[2rem]` on a card | `rounded-card` |
| `<div className="bg-white/5 border border-white/10 rounded-2xl p-5">` | `<Surface level={1}>` |

---

## 10. Guardrails

Enforcement is the only reason a design system survives contact with a
529-component codebase. Recommended, in order of value:

1. **ESLint `no-restricted-syntax`** — flag `<button>` in `components/**` outside
   `components/ui/`, and flag `className` strings matching `#[0-9a-fA-F]{6}` or
   `rounded-\[`.
2. **CI drift check** — the audit greps at the top of this doc, run as a script
   that fails when a count goes *up*. Cheap ratchet, no big-bang refactor.
3. **A `/ds` route** rendering every variant × size × theme. Since
   `vite build` does not typecheck (undeclared identifiers reach runtime), a
   visual gallery is the fastest way to catch a broken control across all nine
   themes before it ships.

## 11. Accessibility floor

- Comfortable hit area ≥ 44px — automatic for `md`+, added via `.tap` for `xs`/`sm`.
- One visible focus ring everywhere; never `outline: none` without a replacement.
- `IconButton` requires `aria-label` at the type level.
- `loading` sets `aria-busy`; errors use `role="alert"`.
- `prefers-reduced-motion` honoured in the control layer.
- Contrast: `accent` uses near-black text on orange, not white — white on
  `#FF8C00` fails AA.

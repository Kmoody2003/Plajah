# Plajah Character Avatars — Living Digital Beings

Characters from a **World** become first-class **profile accounts**: living digital avatars and
chatbots, defined and driven by their creators. Creators can use Plajah's built-in AI or **bring
their own AI** to power a character. This blueprint defines the system; the foundation (data model +
base character profile) ships alongside it.

---

## 1. Principles

- **Creator-owned & creator-gated.** A character is an extension of its creator's IP. Only the
  character's **driver** (its creator, or a delegate they name) can enable it, drive it, or turn it
  on. Nothing about a character is "live" until the creator flips it on.
- **Rooted in a World.** Every character belongs to a `worldId`. Its profile, lore, relationships,
  and theme derive from that world connection — a character is never orphaned.
- **Distinct by design.** Character profiles wear a **violet/purple** hue so a visitor instantly
  knows they're looking at a fictional being, not a real person. (Regulatory + trust: AI personas
  must be legible as such.)
- **Honest AI.** A character chatbot always discloses it is an AI persona. No impersonation of real
  people; content passes the same safety engine as the rest of the platform.

---

## 2. Data model (foundation — ships now)

Characters already exist (`types.ts` `Character`: `worldId`, `name`, `bio`, `lore`, `relationships`,
`gallery`, `modelUrl`, `accentColor`, …). We add an **account layer** on top, all optional and
**off by default**:

```ts
interface CharacterAccountConfig {
  enabled?: boolean;          // creator turned the profile "on" (public account exists)
  driverUid?: string;         // who may drive it (defaults to the world/character creator)
  handle?: string;            // @handle for the character account
  themeHue?: number;          // violet by default (~275); creator may nudge within the purple band
  // ── Living-avatar / chatbot (Phase 1+) ──
  aiEnabled?: boolean;        // chat is live
  persona?: string;           // extra system-prompt personality on top of derived lore
  greeting?: string;          // first line when someone opens a chat
  voiceId?: string;           // TTS voice for the living avatar
  provider?: CharacterAIProvider; // which brain powers it (see §4)
  autoPost?: boolean;         // may the character post to its own feed (Phase 4)
}
```

Stored on the `Character` doc as `account?: CharacterAccountConfig`. The character's public profile
is addressable at `/character/<worldId>/<characterId>` (and a vanity `/c/<handle>`).

**Identity:** a character account is NOT a `users/` doc. It's the `Character` entry, surfaced through
a profile view. This keeps auth clean (no fake logins), lets one creator run many characters, and
means a character can never be confused with a real user account.

---

## 3. The living avatar & chatbot

A character can present three escalating levels; the creator opts into each:

1. **Profile** (Phase 0, now): a violet-themed page — hero, world badge, bio/lore, gallery,
   relationships, linked music/scenes. Read-only. Creator-gated "on" switch.
2. **Chatbot** (Phase 1): a "Chat with {name}" surface. The persona system prompt is **derived** from
   the character's own canon — `name`, `role`, `bio`, `lore`, `physicalStats`, `relationships`,
   `tags`, world context — plus the creator's optional `persona`/`greeting`. Backed by the built-in
   **MAI** service (`microsoftAIService` / `ariaContextService`) by default. Every reply is tagged
   as AI; safety-filtered; rate-limited per viewer.
3. **Living avatar** (Phase 3): the chatbot rendered as the character's **VRM model** (`modelUrl` via
   the existing `AvatarStudio` / three-vrm stack) with lip-synced **TTS** (`voiceId`) — the markerless
   VTuber pipeline already in the codebase. Optional real-time voice chat.

**Persona builder** (server-side, deterministic): `buildCharacterSystemPrompt(character)` composes a
guardrailed prompt: identity + canon + relationships + "stay in character, you are a fictional AI
persona from <world>, never claim to be a real person, refuse <safety list>." The creator's freeform
`persona` is appended but cannot override the guardrails.

---

## 4. Bring Your Own AI (BYO-AI)

Creators can point a character at their own model instead of Plajah's MAI. The contract is a thin,
provider-agnostic adapter so any brain can drive a character.

```ts
type CharacterAIProvider =
  | { kind: 'PLAJAH_MAI'; model?: string }                              // default, no setup
  | { kind: 'OPENAI'; model: string; keyRef: string }                  // creator's OpenAI key
  | { kind: 'ANTHROPIC'; model: string; keyRef: string }               // creator's Claude key
  | { kind: 'WEBHOOK'; endpoint: string; authRef?: string };           // creator-hosted endpoint
```

- **Never store raw secrets client-side.** `keyRef`/`authRef` are references to a secret held in
  the creator's server-side vault (Cloud Run + Secret Manager), set via a one-time "Connect your AI"
  flow. The client only ever sees the `kind` + non-secret config.
- **Server proxy is the only caller.** `POST /api/character/chat` on Cloud Run:
  1. loads the character + `account.provider`, verifies the character is `aiEnabled`,
  2. builds the guardrailed system prompt (§3),
  3. dispatches to the provider adapter (MAI / OpenAI / Anthropic / the creator's `WEBHOOK`),
  4. runs the reply through the content-safety engine,
  5. streams it back, attributing token cost to the **creator** (their key / their endpoint) so
     Plajah never pays for a creator's private model.
- **Webhook contract** (for fully custom brains): Plajah `POST`s
  `{ character, messages, persona, world }` → creator returns `{ reply }` (or an SSE stream).
  Signed with a per-character secret; timeout + fallback to a safe canned line on error.
- **Interaction surfaces:** DMs, a chat drawer on the character profile, `@mention` a character in
  a World room, and (Phase 4) the character replying to comments / posting to its own feed.

**Trust & safety:** disclosure banner on every character chat; per-provider rate limits + spend caps;
moderation on both prompt and completion; a global kill-switch per character (creator) and per
platform (admin). Real-person likeness/voice requires explicit consent records.

---

## 5. Profile look — violet/purple

- Character profiles use a **violet→purple** gradient hue and glow (`themeHue` ~275°, in the
  `#6B0099 / #7C3AED / #A855F7` band), distinct from the brand orange/magenta of human profiles.
- A **World badge** links back to the parent world; the accent can blend the world's own color with
  the violet base.
- A persistent, tasteful **"AI persona"** chip so it always reads as a digital being.
- The whole treatment only renders once the creator has switched the account **on**.

---

## 6. Phasing

- **Phase 0 — Foundation (this PR):** `CharacterAccountConfig` type; `characterAccountService`
  (enable/disable, drive-permission, persona-prompt builder); base **CharacterProfileView** (violet
  theme, world connection, gallery/lore, creator-gated "Bring to life" switch). Chat CTA present but
  gated/stubbed.
- **Phase 1 — Chatbot (MAI):** `/api/character/chat` with the derived persona over MAI; chat drawer.
- **Phase 2 — BYO-AI:** provider adapters (OpenAI/Anthropic/Webhook) + the "Connect your AI" secret
  flow + cost attribution.
- **Phase 3 — Living avatar:** VRM render + TTS + lip-sync (reuse VTuber/AvatarStudio); optional voice.
- **Phase 4 — Autonomy:** opt-in feed posting, comment replies, presence in World rooms, cross-
  character interactions — all creator-gated and safety-bounded.

---

## 7. Reused building blocks

`Character` model + `CharacterCard` / `CharacterWorldView` / `CharacterDetailModal` · `AvatarStudio` /
`AvatarViewer` / three-vrm (living avatar) · `microsoftAIService` / `ariaContextService` (MAI brain) ·
the content-safety engine · Rooms (`roomService`) for in-world presence · the Stat Card framework
(a character trading card is a natural extension).

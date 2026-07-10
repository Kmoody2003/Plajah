# Chora on Alexa

Lets someone say **"Alexa, ask Chora to play Sunflowers"** and stream a track from the
public Chora catalog on any Echo device.

## How it works

- The custom skill's endpoint is **`POST https://plajah.com/api/alexa`** (implemented in
  `server.ts`, runs on Cloud Run).
- On a play request it searches the **public** Chora music catalog (Firestore `albums`,
  `type: MUSIC`), scores the best title/artist match, and returns an `AudioPlayer.Play`
  directive pointing at the track's HTTPS URL.
- As a track nears its end it enqueues the **next track in the same album** (gapless
  album play). "Next", "previous", "pause", "resume", and "stop" all work.
- **Only public, published music is reachable.** Private-library / music-locker /
  intimate-only tracks are never exposed (legal). Alexa also requires HTTPS streams, so
  non-HTTPS URLs are skipped.

## One-time setup (Amazon Developer Console — you must do this part)

Claude can't create the skill in your Amazon account. Do this once:

1. Go to <https://developer.amazon.com/alexa/console/ask> → **Create Skill**.
   - Name: **Chora**. Model: **Custom**. Hosting: **Provision your own**.
2. **Interaction Model → JSON Editor**: paste the contents of
   [`chora-interaction-model.json`](./chora-interaction-model.json) and **Save + Build**.
3. **Interfaces**: turn **Audio Player** ON. (Save + rebuild.)
4. **Endpoint**: choose **HTTPS**.
   - Default region URL: `https://plajah.com/api/alexa`
   - SSL cert type: **"My development endpoint is a sub-domain of a domain that has a
     wildcard certificate from a certificate authority"** (plajah.com has a real cert).
5. Copy the skill's **Application/Skill ID** (looks like `amzn1.ask.skill.xxxx`).
6. Set it on Cloud Run as an env var so the endpoint only accepts your skill:
   ```
   ALEXA_SKILL_ID=amzn1.ask.skill.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
   (Cloud Run → service `plajah-api` → Edit & deploy new revision → Variables.)
7. **Test** tab → set to **Development** → type or say
   *"ask Chora to play &lt;song&gt;"*. It plays on any Echo signed into the same Amazon
   account. No public certification needed for your own devices.

## Environment variables (Cloud Run `plajah-api`)

| Var | Purpose |
| --- | --- |
| `ALEXA_SKILL_ID` | Your skill id. The endpoint rejects requests from any other skill. Leave unset only while first wiring things up. |
| `ALEXA_SKIP_SIGNATURE` | Set to `true` **only** for local testing without Amazon's signed requests. Never in production. |

## Notes / next steps

- **Invocation name is "Chora"** → phrasing is *"Alexa, ask Chora to play …"* or
  *"Alexa, open Chora"* then *"play …"*. Native *"Alexa, play … on Chora"* (no "ask")
  requires Amazon's **Music Skill API**, which is partner-gated and needs Amazon approval
  — a later phase.
- **Personal library / "my playlist"** would need Alexa **account linking** (OAuth) to map
  an Amazon user to a Plajah account. Not included in this v1, and locker tracks stay
  non-shareable regardless.
- To make the skill public (any Amazon user), submit it for **certification** — full
  request-signature verification is already implemented server-side, which certification
  requires.

# Chora on Alexa & Google Home

Stream music, albums, and DJ sets from **Chora** on any **Amazon Echo** or **Google Home / Nest** speaker.

```
"Alexa, ask Chora to play Sunflowers"
"Alexa, ask Chora to play music by The Weeknd"
"Alexa, ask Chora to play the album Renaissance"
"Alexa, ask Chora to play a DJ mix"
"Alexa, pause" / "Alexa, next" / "Alexa, what song is this?"

"Hey Google, talk to Chora"
"Hey Google, ask Chora to play Sunflowers"
```

---

## 1. Alexa Skill Setup (Amazon Developer Console)

The user setup supports **two hosting models**:

### Option A: Alexa-Hosted (Recommended if your skill is already "hosted" in the console)

If you created an **Alexa-hosted (Node.js)** skill in the Alexa Developer Console:

1. Go to [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask).
2. Open your **Chora** skill.
3. **Interaction Model**:
   - In the left sidebar, click **JSON Editor**.
   - Paste the contents of [`alexa/chora-interaction-model.json`](./chora-interaction-model.json).
   - Click **Save Model** then **Build Model**.
4. **Interfaces**:
   - In the left sidebar, click **Interfaces**.
   - Turn **Audio Player** ON.
   - Click **Save Interfaces** and rebuild the model.
5. **Code Editor**:
   - Click the **Code** tab at the top.
   - In `index.js`, paste the code from [`alexa/lambda/index.js`](./lambda/index.js).
   - In `package.json`, paste the code from [`alexa/lambda/package.json`](./lambda/package.json).
   - Click **Save** and then click **Deploy**.
6. **Test**:
   - Click the **Test** tab.
   - Change "Skill testing is enabled in:" to **Development**.
   - Type or speak: `ask chora to play sunflowers` or `open chora`.

---

### Option B: Self-Hosted / Webhook (Cloud Run)

If you prefer to route requests directly to your own server at `https://plajah.com/api/alexa`:

1. In the Alexa Console, go to **Endpoint**.
2. Select **HTTPS**.
3. In **Default Region**, enter: `https://plajah.com/api/alexa`
4. Under SSL certificate, choose:
   *"My development endpoint is a sub-domain of a domain that has a wildcard certificate from a certificate authority"*.
5. (Optional) In Cloud Run environment variables, set `ALEXA_SKILL_ID=amzn1.ask.skill.xxxx` to enforce that only your Alexa skill can send requests.

---

## 2. Google Home / Google Assistant Setup

See [`google-home/README.md`](../google-home/README.md) for full instructions:

1. **Conversational Action**:
   - Webhook URL: `https://plajah.com/api/google-action`
   - Config file: [`google-home/action.json`](../google-home/action.json)
2. **Google Cast (Direct Streaming)**:
   - Tap the Cast icon inside the Chora player in Plajah to stream directly to any Google Home / Nest speaker.

---

## 3. Supported Voice Commands

| Utterance | What it does |
| --- | --- |
| *"Alexa, open Chora"* | Greets the listener and asks what they'd like to hear |
| *"Alexa, ask Chora to play &lt;song&gt;"* | Searches Chora catalog and streams the track |
| *"Alexa, ask Chora to play &lt;song&gt; by &lt;artist&gt;"* | Plays track with artist disambiguation |
| *"Alexa, ask Chora to play music by &lt;artist&gt;"* | Streams top tracks from that artist |
| *"Alexa, ask Chora to play the album &lt;album&gt;"* | Plays album from track 1 with gapless playback |
| *"Alexa, ask Chora to play a mix"* | Plays a Chora DJ mix or set |
| *"Alexa, next"* / *"Alexa, previous"* | Navigates through album tracks |
| *"Alexa, pause"* / *"Alexa, resume"* | Stops and resumes streaming |
| *"Alexa, ask Chora what song is this"* | Speaks current track title and artist |

---

## 4. Privacy & Safety Guarantee

Only **public, published music** (`type: 'MUSIC'`, `isPublic: true`, `isIntimateOnly: false`) is accessible via voice search. Private tracks, locker-only tracks, and intimate collections are completely excluded from voice index lookups.

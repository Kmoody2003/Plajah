# Chora on Google Home / Google Assistant

Allows users to say:
- **"Hey Google, talk to Chora"**
- **"Hey Google, ask Chora to play Sunflowers"**
- **"Hey Google, ask Chora to play a DJ mix"**
- **"Hey Google, ask Chora to play songs by [Artist]"**

Plays music streams directly to Google Nest Hub, Nest Audio, Google Home Mini, and Assistant devices.

---

## 1. Conversational Action Setup (Google Actions Console)

1. Go to the [Google Actions Console](https://console.actions.google.com).
2. Click **New Project** → choose your project name (e.g., `Chora Music`) → choose **Custom** or **Media**.
3. Under **Develop** → **Fulfillment**:
   - Webhook URL: `https://plajah.com/api/google-action`
4. Under **Invocation**:
   - Set Display Name to: **Chora**
5. Deploy `google-home/action.json` using the `gactions` CLI:
   ```bash
   gactions push --action-package google-home/action.json --project YOUR_PROJECT_ID
   gactions deploy preview --project YOUR_PROJECT_ID
   ```
   Or create the intents (`PlayMusic`, `PlaySong`, `PlayArtist`, `PlayAlbum`, `PlayMix`) directly in the Actions Builder web console.
6. Under **Test**:
   - Enable testing for your account.
   - Speak or type: `"Talk to Chora"` or `"Ask Chora to play Sunflowers"`.
   - The Assistant simulator will return the audio player widget and stream the track.

---

## 2. Google Cast to Nest / Google Home Speakers

You don't even need an action deployed to stream Chora to your Google Home speakers!
Every Google Nest Hub and Google Home speaker is a **Google Cast Receiver**.

- In the Plajah web app or mobile app, click the **Cast icon** in the Chora player.
- Select your Google Home / Nest speaker from the device list.
- Chora will stream full-fidelity audio directly to the speaker using `services/googleHomeService.ts` (`buildCastMediaInfo`).

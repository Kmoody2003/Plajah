# Demo VTuber character

The live streamer's **"✨ Try demo avatar"** button fetches **`/vtuber/demo-character.png`**
(this folder) and builds a face-tracked 2D live-puppet from it, so any user can test VTuber
mode with one tap — no upload needed.

## Add the demo image

Save a character image here as **`demo-character.png`**.

**Best results:** a single, clear, **front-facing** figure or a **face close-up** (not a
multi-view character sheet — the face tracker builds the puppet from one detected face).
From the provided character sheet, crop to the **front full-body view** or one of the
**face close-ups**.

- Path: `public/vtuber/demo-character.png`
- Format: PNG or JPG, front-facing, face clearly visible
- After adding it, commit + deploy — then the demo works for everyone.

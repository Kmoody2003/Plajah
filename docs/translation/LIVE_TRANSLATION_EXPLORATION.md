# Live Translation & Dubbing — Exploration

**Idea:** auto-translate **live video + live audio** into another language in real time. Start with a **synthetic voice**, then **match the speaker's own voice**. Run it **on-device, not in the cloud**.

This is **real-time speech-to-speech translation (S2ST)** — "live dubbing" / simultaneous interpretation. It's feasible today with open-source models; the honest split is **what runs in the browser (WebGPU) now** vs. **what needs the native app** (the Crossover/Tauri build, which can use the discrete GPU — see [[plajah-pixels-gpu-ceiling]]).

---

## 1. The pipeline (cascaded S2ST)
Real-time, streamed in phrase-sized chunks so it behaves like a human interpreter:

```
mic / live audio
   │
   ▼
[VAD]  segment into utterances (Silero VAD / WebRTC VAD)
   │
   ▼
[ASR]  speech → text (source lang)        ← Whisper / Moonshine
   │
   ▼
[MT]   text → text (target lang)          ← Bergamot / NLLB / M2M-100
   │
   ▼
[TTS]  text → speech (target lang)        ← Kokoro / Piper   (Phase 1: synthetic)
   │                                         + voice-match    (Phase 2)
   ▼
translated audio track  →  language channel listeners select
   │  (+ caption overlay for video)
```

Each stage streams; translate on sentence/phrase boundaries so latency is "interpreter-like" (~2–5s), not per-word.

---

## 2. Open-source models, per stage (local-first)

**VAD (segmentation):** Silero VAD (tiny, ONNX, runs anywhere) or WebRTC VAD — decide when an utterance ends so the next stage fires.

**ASR (speech → text):**
- **Whisper** (OpenAI, MIT) — the workhorse. In-browser via **`whisper-web` / transformers.js + WebGPU** (whisper-base/small realistically real-time on a decent GPU); native via **whisper.cpp / faster-whisper** (much faster, uses the dGPU). Whisper can also translate-to-English directly, but only English — we want any→any, so use it for ASR only.
- **Moonshine** — newer, faster on-device ASR for streaming; good low-latency option.

**MT (translate):**
- **Bergamot / Firefox Translations** (Mozilla, WASM) — *purpose-built for local, offline, private* translation. Best "not-in-the-cloud" fit; per-language model pairs, very light.
- **NLLB-200** (Meta) or **M2M-100** — 200-language coverage via ONNX/transformers.js (heavier, WebGPU). Use when Bergamot lacks a pair.

**TTS — synthetic voice (Phase 1):**
- **Kokoro** (`kokoro-js`) — small, high-quality, **runs in-browser on WebGPU/WASM**. Great default synthetic voice.
- **Piper** (Rhasspy) — fast local neural TTS, many languages, ONNX/WASM; ideal native.

**Voice matching — sound like the speaker (Phase 2):**
- **OpenVoice** (MyShell) — separates *content* from *tone color*; generate with a base TTS, then apply the speaker's timbre from a short reference. Clean architecture for "match the voice."
- **RVC / seed-vc / kNN-VC** — voice **conversion**: run the synthetic TTS output through a model of the target speaker. Real-time RVC exists.
- **XTTS v2** (Coqui) — zero-shot multilingual cloning from a few seconds of reference. Heaviest; best quality.

**End-to-end target (the north star):**
- **Meta SeamlessM4T / SeamlessStreaming / SeamlessExpressive** — one model, **speech-in → translated-speech-out**, **preserves the speaker's vocal style + prosody**, with a **streaming** variant. This is exactly the goal (voice-preserving, low-latency, any-to-any). It's large — a **native-app** model, not in-browser today.

**Video lip-sync (Phase 4, optional):** Wav2Lip / VideoReTalking / LatentSync to align the speaker's lips to the dubbed audio. Heavy — native/offline render, not live-web.

---

## 3. Local execution — the honest split
- **Browser (WebGPU), available now:** the *light cascade* — Silero VAD + **Whisper-small** + **Bergamot/NLLB** + **Kokoro/Piper**. Synthetic-voice live dubbing + captions, fully on-device. Latency a few seconds; quality good.
- **Native Crossover/Tauri app:** the *heavy* stuff — **whisper.cpp** (faster ASR on the dGPU), **XTTS/OpenVoice/RVC** voice-matching, **SeamlessExpressive** streaming, and **lip-sync**. The web build can't touch the RTX 4070 ([[plajah-pixels-gpu-ceiling]]); the native app can. So: **web = synthetic + light voice-conversion; native = full voice-match + expressive + lip-sync.**

Everything stays on the device. No audio leaves for translation.

---

## 4. Plajah integration
A **TranslationProcessor** taps a `MediaStream` (the exact pattern VTuber Mode uses: stream in → processed out) and emits a **translated audio track** + a **caption stream**. Surfaces:
- **Live Talk / podcast studio / video switcher / live streams** — offer **language channels**: a listener picks a language, hears the dubbed track (the original is one channel, each translation another). Reuses the mix-bus / multi-track thinking already in the podcast studio.
- **Walkie / DMs** — translate a voice note or PTT on the fly.
- **Video** — dubbed audio track + a caption overlay; (lip-sync later).

Per-speaker voice profiles (a short enrolled reference) live with the user so their dub always sounds like them.

---

## 5. Phases
1. **Synthetic live dub + captions** — VAD→Whisper→Bergamot/NLLB→Kokoro, in-browser WebGPU, on one surface (podcast studio or live talk), language-channel selectable.
2. **Voice matching** — enroll a short reference of the speaker; apply OpenVoice tone-color (or RVC) to the synthetic output so the dub sounds like them.
3. **Expressive + low-latency streaming** — adopt a Seamless-class model in the **native app** for prosody + sub-second lag.
4. **Video lip-sync** — Wav2Lip-class, native/offline render for produced (non-live) video.

---

## 6. Hard parts & open questions
- **Latency vs. quality:** cascaded adds up; streaming ASR + incremental MT + chunked TTS keep it interpreter-like, not instant. End-to-end Seamless is lower-latency but native-only.
- **In-browser model size:** Whisper-small + NLLB + Kokoro is a sizable WebGPU download; cache aggressively, lazy-load only when translation is turned on. Bergamot keeps MT tiny.
- **Voice-clone consent & ethics (important):** cloning a voice needs the **speaker's consent**. A creator dubbing **their own** voice is consensual; **guests/callers must opt in**. Add consent capture + an audible/inaudible **watermark** on synthesized voice, and never enroll a voice without permission.
- **Decisions:** cascaded vs. end-to-end (recommend cascaded for the web MVP, Seamless for native); which TTS (Kokoro web / Piper native); how to expose language channels in the player; where voice profiles are stored (on-device + optional encrypted sync).

---

## 7. Recommendation
Build **Phase 1 (synthetic, in-browser WebGPU)** as a `TranslationProcessor` first — it's achievable now, fully local, and proves the loop on a real surface (podcast studio or live talk) with selectable language channels + captions. Then layer **voice-matching (Phase 2)** and push the **expressive/streaming + lip-sync** heavy models into the **native Crossover app**. This mirrors how VTuber Mode was staged (engine → modes), and respects the GPU reality: light + local in the web, heavy + local in native.

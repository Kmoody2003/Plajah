# Convolution Reverb IR Library — Licensing Reference

Research date: 2026-09-07. For Plajah / Melos convolution reverb.

**Goal:** IR packs whose license genuinely permits **redistribution inside a commercial app**
(attribution/credit is fine; non-commercial and no-redistribution licenses are not).

> **Rule of thumb applied here:** an IR is only marked "bundleable" if the license text
> explicitly permits redistribution + commercial use (CC0, CC-BY, MIT/BSD, or an explicit
> "royalty-free for any purpose incl. redistribution" grant). "Free to download" or
> "free to use" is **not** the same as "free to redistribute inside your product" — several
> popular packs (Voxengo, Samplicity) are the latter and are **excluded**.

---

## TL;DR ranked shortlist (safe to bundle in a commercial app)

| Rank | Source | License | Commercial redistribution | Best for |
|------|--------|---------|---------------------------|----------|
| 1 | **Adventure Kid AKRT** | CC BY 4.0 (uniform) | ✅ Yes, w/ attribution | Springs, plates, cabs, small rooms |
| 2 | **OpenAIR** (curated subset) | **Per-file varying** — mostly CC BY 4.0, some CC BY-SA / CC BY-NC | ⚠️ Only the CC0/CC-BY rooms | Halls, cathedrals, tunnels, weird/iconic spaces |
| 3 | **Aachen AIR (RWTH/IKS)** | MIT | ✅ Yes, w/ license notice | Rooms, booth, lecture hall, stairway, church, office (binaural) |
| 4 | **Research CC-BY datasets** (Arni, BUT Reverb, dEchorate, MeshRIR, Motus, FLAIR) | CC BY 4.0 | ✅ Yes, w/ attribution | Neutral rooms / filler; less "musical" |
| 5 | **EchoThief** | Custom (derivative-only) | ⚠️ Convolving = OK; **shipping the raw WAVs is not clearly granted — must email to confirm** | Caves, stairwells, tunnels, skateparks, glaciers, "weird" spaces |

**Do NOT bundle:** Voxengo (no redistribution), Samplicity Bricasti M7 (non-commercial + legally murky), Isophonics C4DM / MIRACLE (CC BY-NC-SA), MIT IR Survey (no stated license), Fokke van Saane (license unclear).

**Handle carefully:** CC BY-SA (ShareAlike, potentially viral) and CC BY-ND (NoDerivatives) — see notes below.

---

## GREEN — clearly redistributable

### 1. Adventure Kid — AKRT (Adventure Kid Reverb Tools) — TOP PICK
- **URL:** https://www.adventurekid.se/akrt/free-reverb-impulse-responses/
- **License:** **CC BY 4.0** (uniform across the pack). Exact statement on the page:
  *"This work is licensed under a Creative Commons Attribution 4.0 International License."*
  Attribution required if redistributed. ("Free as in beer" for production use; donations encouraged.)
- **Spaces:** Small rooms (real rooms + reverb units), speaker/amp cabinets, and **6 spring-reverb sets**
  (incl. a stereo "Dual Springer"). Note: this is the strong pick for **springs/plates/cabs/small rooms**,
  NOT big halls/cathedrals.
- **Format:** WAV, 44.1 kHz, **32-bit float**, mix of mono and stereo. Pack is small (tens of MB).
- **Attribution string (suggested):**
  `Reverb IRs: Adventure Kid Reverb Tools (AKRT) by Kristoffer Ekstrand / adventurekid.se — CC BY 4.0`
- **Why #1:** single clean uniform license, modern well-labeled files, no per-file archaeology needed.

### 2. OpenAIR — The Open Acoustic Impulse Response Library — BEST SPACES, but curate
- **URLs:** Catalog: http://www.openairlib.net  ·  Project (Univ. of York AudioLab):
  https://www.openair.hosted.york.ac.uk/  (**NOTE: as of this research the york.ac.uk host was
  returning "Account Suspended" — verify availability; use openairlib.net or archived mirrors**).
  Original historical domain was `openair.hull.ac.uk` (defunct → migrated to York).
- **License:** **PER-FILE VARYING.** OpenAIR is a *collective* library — contributors choose the CC
  license per contribution. Aggregators commonly summarize the whole project as "CC BY 4.0," and the
  **majority of rooms are CC BY**, but individual rooms can be **CC BY-SA** (viral) or **CC BY-NC**
  (non-commercial — NOT usable). **You must check each room's own license page and record it.**
  Do **not** bulk-bundle OpenAIR; hand-pick CC0/CC-BY rooms and log the exact license + attribution
  per file.
- **Spaces:** The richest "spaces" catalog — cathedrals & churches (e.g. York Minster, St Andrew's),
  concert/central halls, Maes Howe (neolithic chamber), tunnels, stairwells, caves, nuclear reactor
  halls, and other iconic/weird rooms. ~46+ environments.
- **Format:** Multiple — mono, **true-stereo**, **B-format (Ambisonic)**, 5.1. Typically 48 kHz / 24-bit
  WAV. Per-room downloads are a few MB each.
- **Attribution:** Required per CC BY. Each room page supplies its own recommended citation; general form:
  `<Space name> impulse response, OpenAIR (openairlib.net), recorded by <contributor>, licensed CC BY 4.0`
- **Action:** Curate ~15-25 of the best CC-BY halls/cathedrals/weird spaces; exclude every NC room;
  isolate/avoid SA rooms (see ShareAlike note).

### 3. Aachen Impulse Response (AIR) Database — RWTH Aachen / IKS
- **URLs:** https://www.iks.rwth-aachen.de/en/research/tools-downloads/databases/aachen-impulse-response-database/
  · mirror: https://www.openslr.org/20/
- **License:** **MIT** (permissive — commercial use OK, just include the license notice).
- **Spaces:** ~5 environments incl. booth, office, meeting room, lecture room, stairway, and a **church**;
  variable reverb times.
- **Format:** MATLAB `.mat` **and WAV** versions. **Binaural (BRIR)** — measured with a dummy head, so
  files carry HRTF/head coloration. Usable musically but tonally colored; treat as a niche/character set,
  not a neutral hall.
- **Attribution:** Include MIT license notice + cite Jeub, Schäfer, Vary (2009), "A binaural room impulse
  response database for the evaluation of dereverberation algorithms."

### 4. Research CC-BY 4.0 room-IR datasets (GitHub / Zenodo) — filler / neutral rooms
Catalogued in https://github.com/Graphi07/room-impulse-responses . All **CC BY 4.0**, commercial OK w/ attribution:
- **Arni** — variable-acoustics lab (many absorber configs) — https://zenodo.org/record/6985104
- **BUT ReverbDB** — 8 real rooms — https://speech.fit.vut.cz
- **dEchorate** — measured room, 11 conditions — https://zenodo.org/record/5562386
- **MeshRIR** — moderately reverberant room, dense grid — https://sh01k.github.io/MeshRIR
- **Motus** — single room, varied furniture — https://zenodo.org/record/4923187
- **FLAIR** — single room + 3D geometry — https://zenodo.org/records/17037517
- **HOMULA-RIR / MP-RIR** — seminar / complex room — polimi / zenodo
These are engineering datasets (single rooms, arrays) — less "musical," but clean and freely bundleable
for neutral small/medium room presets. Attribution = cite each dataset's paper/DOI.

---

## AMBER — usable only with a caveat / must confirm

### 5. EchoThief — Dr. Chris Warren (SDSU)
- **URLs:** https://www.echothief.com/ · downloads: https://www.echothief.com/downloads/
- **License:** **Custom, derivative-only.** Exact wording:
  *"You are welcome to use the EchoThief Impulse Response Library to create derivative work (such as
  convolving it with other sounds to create reverberation). If you would like to use it in any other way,
  you can reach the creator…"* (contact: chris@superhoax.com / cwarren@sdsu.edu). Copyright 2013-2026.
- **Interpretation:** Using the IRs *inside* a convolution engine (user convolves their audio) is the
  explicitly blessed "derivative work" use. **Redistributing the raw WAV files as a bundled asset pack**
  is arguably "any other way" and is **not clearly granted** — get written permission before bundling
  the files. (Convolving on a server / baking presets is safer than shipping the WAVs to disk.)
- **Spaces:** ~100+ unique North American spaces — caves, skateparks, stairwells, underpasses, glaciers,
  fortresses, tunnels, and other "weird" real spaces. Excellent character library.
- **Format:** Stereo WAV. (Page doesn't state rate/size; historically ~48 kHz stereo, full library a few
  hundred MB.)
- **Attribution string (suggested if permission granted):**
  `Impulse responses from the EchoThief Library by Dr. Chris Warren (echothief.com)`

### CC BY-SA (ShareAlike) sources — VIRAL, handle carefully
- **SRIRACHA** — CC BY-SA 4.0 (shoebox room, varying absorption) — TU Berlin.
- Some **OpenAIR** rooms.
- **Risk:** ShareAlike can require adaptations to be released under a compatible license. Whether merely
  *bundling + convolving* an IR (using it as-is, unmodified) triggers SA obligations is legally debatable,
  but the safe posture for a closed-source commercial app is to **avoid SA IRs or keep them out of the
  bundle**. Do not mix SA files into the shipped pack without legal sign-off.

### CC BY-ND (NoDerivatives)
- **ACE Challenge** — CC BY-ND 4.0. You may redistribute the files **unmodified**, but may **not** ship
  trimmed/processed/normalized versions. If your pipeline resamples or trims IRs, ND is a problem — prefer
  to skip.

---

## RED — do NOT bundle in a commercial app

| Source | URL | License / reason |
|--------|-----|------------------|
| **Voxengo** free IRs (IM Reverbs Pack, 41 designs) | https://www.voxengo.com/impulses/ | Free for use incl. commercial *projects*, but license says *"You may not sell these impulse files or earn any direct or indirect profit from their distribution"* and forbids charging for redistribution. **Bundling into a product = prohibited.** |
| **Samplicity Bricasti M7** (134 true-stereo/mono IRs) | https://samplicity.com/downloads/ | "NewconomyWare," **non-commercial** use only. Also **legally murky**: these are IRs *of* a copyrighted/trademarked hardware unit (Bricasti M7) — sampling a commercial reverb's sound is a rights gray area. **Exclude.** |
| **Isophonics / C4DM** (Queen Mary) | https://isophonics.net | **CC BY-NC-SA** — non-commercial. Exclude. |
| **MIRACLE** | depositonce.tu-berlin.de | **CC BY-NC-SA 4.0** — non-commercial. Exclude. |
| **MIT IR Survey** (Traer & McDermott, PNAS 2016 — 271 real-world spaces) | https://mcdermottlab.mit.edu/Reverb/IR_Survey.html | **No stated license.** Great real-world spaces, but no redistribution grant → treat as all-rights-reserved. Could email authors for permission; do not bundle without it. |
| **Fokke van Saane** | http://fokkie.home.xs4all.nl/IR.htm | License unclear; other redistributors (e.g. idiap acoustic-simulator) note *"Due to licensing issues, we cannot redistribute them."* Treat as not-redistributable without permission. |

---

## Bundling size estimate (30–60 quality IRs)

- Stereo, 48 kHz / 24-bit WAV, ~2–4 s IR ≈ **0.5–2 MB each**; true-stereo (4-ch) ≈ **2–4 MB each**.
- **30–60 IRs ≈ ~30–150 MB uncompressed.** Realistic curated pack ≈ **60–120 MB**.
- **Halve it** by shipping FLAC (lossless) instead of WAV, or store at 44.1 kHz if 48 k isn't needed.
- Suggested curated mix: ~20 OpenAIR CC-BY halls/cathedrals/tunnels + full AKRT (springs/plates/cabs,
  small footprint) + a handful of neutral CC-BY research rooms → covers halls, chambers, plates, springs,
  rooms, and weird spaces within ~80–120 MB.

## Per-source attribution strings (copy into an in-app credits screen)

- `Adventure Kid Reverb Tools (AKRT) — Kristoffer Ekstrand, adventurekid.se — CC BY 4.0`
- `OpenAIR — openairlib.net (University of York AudioLab) — individual rooms CC BY 4.0 unless noted; per-room credit as listed`
- `Aachen Impulse Response Database — RWTH Aachen IKS (Jeub/Schäfer/Vary 2009) — MIT License`
- Research datasets: cite each dataset name + DOI + "CC BY 4.0."
- EchoThief (only if permission obtained): `EchoThief Library — Dr. Chris Warren, echothief.com`

## Open follow-ups
1. Confirm OpenAIR site availability (york host was suspended at research time) and record each chosen
   room's exact CC license + citation before shipping.
2. Email EchoThief (chris@superhoax.com) to get explicit permission to redistribute the WAV files, or
   restrict EchoThief use to server-side convolution only.
3. Consider emailing McDermott Lab (MIT IR Survey) for a redistribution grant — 271 real-world spaces
   would be a superb addition if licensed.

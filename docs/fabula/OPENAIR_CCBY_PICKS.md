# OpenAIR — CC-BY Impulse Responses cleared for commercial bundling

Verified **2026-09-07**. Purpose: iconic large-space reverb IRs from OpenAIR (The Open
Acoustic Impulse Response Library) that are licensed **CC-BY 4.0 (attribution only)** and
are therefore safe to bundle and redistribute inside a commercial music app.

## Licensing rule applied
Only **CC-BY 4.0** (or CC0) rooms are listed. Every room below was verified by reading its
own OpenAIR page — the license is **per room**, not per library. Anything CC-BY-NC,
CC-BY-SA, CC-BY-ND, or with no stated license was rejected (see "Rejected" section).

Each accepted room's page carries the identical per-work statement:

> **Attribution — Attribute this work to: `<credit>`. This work is licensed under a
> Creative Commons Attribution 4.0 International License.**
> (link target: `http://creativecommons.org/licenses/by/4.0/`)

## Host situation (important)
- Both public front-ends are **down**: `openair.hosted.york.ac.uk` and `openairlib.net`
  return **"Account Suspended"** as of this date.
- **The actual audio files are still live** on the University of York file server
  **`https://webfiles.york.ac.uk/OPENAIR/IRs/`** — every download URL below was tested with
  `curl -sI` and returns **HTTP 200** right now.
- The OpenAIR room *description pages* (`?page_id=…`) were read via the Wayback Machine
  (`web.archive.org`, snapshot ~2020–2025). The license text quoted here comes from those
  pages. The `?page_id` links will work again if/when the York WordPress host is restored.

## Per-room folder layout on webfiles
Each room is a folder `…/OPENAIR/IRs/<slug>/` containing: `<slug>.zip` (the full bundle),
plus loose format sub-folders `stereo/`, `ms-stereo/`, `mono/`, `b-format/` (Apache
directory listing is enabled, so you can browse each), `examples/`, `images/`,
`Read Me.txt`, `Data Tables/`. **You can grab a single stereo WAV directly, or the whole
zip.** b-format = 4-channel Ambisonic B-format (WXYZ), not stereo.

---

## Verified CC-BY 4.0 rooms (all download URLs tested = HTTP 200)

| # | Room | Cat. | Best format | Direct WAV URL (200) / full ZIP | Format | ZIP size |
|---|------|------|-------------|--------------------------------|--------|----------|
| 1 | **York Minster** | Cathedral | Stereo (ORTF) | `…/york-minster/stereo/minster1_000_ortf_48k.wav` | 2ch 48k/24 | 8.1 MB |
| 2 | **St Paul's Cathedral** (London) | Cathedral | M-S Stereo | `…/st-pauls-cathedral/ms-stereo/msstereo_P1%20-%20S%20Dome%20R%20Nave%20Average.wav` | 2ch 96k/32 | 870 MB |
| 3 | **Lady Chapel, St Albans Cathedral** | Cathedral | Stereo (ORTF) | `…/lady-chapel-st-albans-cathedral/stereo/stalbans_a_ortf.wav` | 2ch 44.1k/24 | 14.8 MB |
| 4 | **St Margaret's Church — Nat. Centre for Early Music** | Cathedral | B-format only | `…/st-margarets-church-national-centre-early-music/b-format/r10_1st_configuration.wav` | 4ch 96k/24 | 431 MB |
| 5 | **Shrine & Parish Church of All Saints, North Street** | Cathedral | Mono only | `…/shrine-and-parish-church-all-saints-north-street-_/mono/r1.wav` | 1ch 96k/16 | 12.8 MB |
| 6 | **Central Hall, University of York** | Hall | B-format only | `…/central-hall-university-york/b-format/ir_centre_stalls.wav` | 4ch 96k/16 | 4.3 MB |
| 7 | **Jack Lyons Concert Hall** (Univ. of York) | Hall | B-format only | `…/jack-lyons-concert-hall-university-york/b-format/rir_jack_lyons_lp1_96k.wav` | 4ch 96k/16 | 8.1 MB |
| 8 | **Elveden Hall** (Suffolk, England) | Hall | Stereo | `…/elveden-hall-suffolk-england/stereo/1a_marble_hall.wav` | 2ch 44.1k/16 | 4.1 MB |
| 9 | **Dixon Studio Theatre** (Univ. of York) | Hall | B-format only | `…/dixon-studio-theatre-university-york/b-format/r1_rir_bformat.wav` | 4ch 96k/16 | 4.0 MB |
| 10 | **Maes Howe** (neolithic chamber, Orkney) | Chamber | Stereo (ORTF) | `…/maes-howe/stereo/mh3_000_ortf_48k.wav` | 2ch 48k/24 | 1.0 MB |
| 11 | **R1 Nuclear Reactor Hall** (Stockholm) | Weird | Stereo (ORTF) | `…/r1-nuclear-reactor-hall/stereo/r1_ortf-48k.wav` | 2ch 48k/24 | 24.3 MB |
| 12 | **Innocent Railway Tunnel** (Edinburgh) | Weird | Mono only | `…/innocent-railway-tunnel/mono/middle_tunnel_4way_mono.wav` | 1ch 96k/24 | 63.2 MB |
| 13 | **Hamilton Mausoleum** (world-record echo) | Chamber | Stereo (ORTF) | `…/hamilton-mausoleum/stereo/hm2_000_ortf_48k.wav` | 2ch 48k/24 | 19.1 MB |
| 14 | **Tyndall Bruce Monument** (Fife) | Weird | Stereo (ORTF) | `…/tyndall-bruce-monument/stereo/tyndall_bruce_ortf.wav` | 2ch 48k/24 | 5.6 MB |
| 15 | **T2 Hangar, Yorkshire Air Museum** | Weird | B-format only | `…/air-museum/b-format/AR_bformat_S1R1_1.wav` | 4ch 44.1k/24 | 18.5 MB |

`…` = `https://webfiles.york.ac.uk/OPENAIR/IRs`

**Best "iconic + true-stereo + small" picks for a music app:** York Minster, Maes Howe,
Hamilton Mausoleum, R1 Nuclear Reactor Hall, Tyndall Bruce Monument, Lady Chapel St Albans,
Elveden Hall. St Paul's is stunning but the bundle is 870 MB (M-S stereo, decode M/S → L/R).
Rooms 4, 6, 7, 9, 15 are **B-format (4-ch Ambisonic)** — decode to stereo before use.
Rooms 5 & 12 are **mono only**.

---

## Full download URLs, per-room page, license quote, and attribution string

> Room page URL format (currently suspended, restore later):
> `https://www.openair.hosted.york.ac.uk/?page_id=<id>`
> All license text below quoted from the Wayback snapshot of that page.
> All WAV/ZIP URLs verified HTTP 200 on `webfiles.york.ac.uk` on 2026-09-07.

### 1. York Minster — Cathedral
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=797`
- Stereo WAV: `https://webfiles.york.ac.uk/OPENAIR/IRs/york-minster/stereo/minster1_000_ortf_48k.wav` (2ch 48kHz/24-bit, 2.7 MB)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/york-minster/york-minster.zip` (8.1 MB)
- License: **CC BY 4.0** — *"This work is licensed under a Creative Commons Attribution 4.0 International License."*
- Attribution: **"www.openairlib.net · Audiolab, University of York · Damian T. Murphy"**

### 2. St Paul's Cathedral (London) — Cathedral
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=1516`
- M-S Stereo WAV: `https://webfiles.york.ac.uk/OPENAIR/IRs/st-pauls-cathedral/ms-stereo/msstereo_P1%20-%20S%20Dome%20R%20Nave%20Average.wav` (2ch 96kHz/32-bit float, 11 MB)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/st-pauls-cathedral/st-pauls-cathedral.zip` (870 MB — huge spatial set: b-format + mono + ms-stereo)
- License: **CC BY 4.0** — *"This work is licensed under a Creative Commons Attribution 4.0 International License."*
  (NOTE: a "CC BY-SA 4.0" mention on the page refers ONLY to an embedded Wikimedia Commons floor-plan **image**, not the IR data. The IR data is CC BY 4.0.)
- Attribution: **"www.openairlib.net"**

### 3. Lady Chapel, St Albans Cathedral — Cathedral
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=595`
- Stereo WAV: `https://webfiles.york.ac.uk/OPENAIR/IRs/lady-chapel-st-albans-cathedral/stereo/stalbans_a_ortf.wav` (2ch 44.1kHz/24-bit, 1.5 MB; `_binaural` variants also present)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/lady-chapel-st-albans-cathedral/lady-chapel-st-albans-cathedral.zip` (14.8 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net · Audiolab, University of York · Marcin Gorzel · Gavin Kearney · Aglaia Foteinou · Sorrel Hoare · Simon Shelley"**

### 4. St Margaret's Church — National Centre for Early Music (NCEM), York — Cathedral
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=696`
- B-format WAV (no stereo provided): `https://webfiles.york.ac.uk/OPENAIR/IRs/st-margarets-church-national-centre-early-music/b-format/r10_1st_configuration.wav` (4ch 96kHz/24-bit, 18.5 MB)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/st-margarets-church-national-centre-early-music/st-margarets-church-national-centre-early-music.zip` (431 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net · Audiolab, University of York · Aglaia Foteinou · Simon Shelley"**

### 5. Shrine & Parish Church of All Saints, North Street (York) — Cathedral
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=644`
- Mono WAV (no stereo provided): `https://webfiles.york.ac.uk/OPENAIR/IRs/shrine-and-parish-church-all-saints-north-street-_/mono/r1.wav` (1ch 96kHz/16-bit; r1–r6 receiver positions)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/shrine-and-parish-church-all-saints-north-street-_/shrine-and-parish-church-all-saints-north-street-_.zip` (12.8 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net · University of York"**

### 6. Central Hall, University of York — Hall
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=435`
- B-format WAV (no stereo provided): `https://webfiles.york.ac.uk/OPENAIR/IRs/central-hall-university-york/b-format/ir_centre_stalls.wav` (4ch 96kHz/16-bit)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/central-hall-university-york/central-hall-university-york.zip` (4.3 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net · Alexander Vilkaitis · Ilias Antonopoulos · Joska De Langen · Xuan Liu"**

### 7. Jack Lyons Concert Hall, University of York — Hall
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=571`
- B-format WAV (no stereo provided): `https://webfiles.york.ac.uk/OPENAIR/IRs/jack-lyons-concert-hall-university-york/b-format/rir_jack_lyons_lp1_96k.wav` (4ch 96kHz/16-bit; lp1–lp4 positions)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/jack-lyons-concert-hall-university-york/jack-lyons-concert-hall-university-york.zip` (8.1 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net · Audiolab, University of York · Alex Duffell · Aishwarya Sridhar · Zhong Li"**

### 8. Elveden Hall (Suffolk, England) — Hall
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=459`
- Stereo WAV: `https://webfiles.york.ac.uk/OPENAIR/IRs/elveden-hall-suffolk-england/stereo/1a_marble_hall.wav` (2ch 44.1kHz/16-bit; also `3a_hats_cloaks_the_lord`, `4a_hats_cloaks_visitors`, `18a_smoking_room`)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/elveden-hall-suffolk-england/elveden-hall-suffolk-england.zip` (4.1 MB)
- License: **CC BY 4.0**
- Attribution: **"Matt Rogalsky"**

### 9. Dixon Studio Theatre, University of York — Hall
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=452`
- B-format WAV (no stereo provided): `https://webfiles.york.ac.uk/OPENAIR/IRs/dixon-studio-theatre-university-york/b-format/r1_rir_bformat.wav` (4ch 96kHz/16-bit; r1–r5)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/dixon-studio-theatre-university-york/dixon-studio-theatre-university-york.zip` (4.0 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net · Ben Lavin · Darren Robinson · Ya-Hsin Chou · University of York"**

### 10. Maes Howe (neolithic chambered cairn, Orkney) — Chamber
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=602`
- Stereo WAV: `https://webfiles.york.ac.uk/OPENAIR/IRs/maes-howe/stereo/mh3_000_ortf_48k.wav` (2ch 48kHz/24-bit, 0.28 MB)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/maes-howe/maes-howe.zip` (1.0 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net · Audiolab, University of York · Damian T. Murphy"**

### 11. R1 Nuclear Reactor Hall (Stockholm) — Weird
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=626`
- Stereo WAV: `https://webfiles.york.ac.uk/OPENAIR/IRs/r1-nuclear-reactor-hall/stereo/r1_ortf-48k.wav` (2ch 48kHz/24-bit, 5.6 MB; `r1_ortf.wav` = 96k variant)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/r1-nuclear-reactor-hall/r1-nuclear-reactor-hall.zip` (24.3 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net · Audiolab, University of York · Dr. Damian T. Murphy"**

### 12. Innocent Railway Tunnel (Edinburgh) — Weird
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=525`
- Mono WAV (no stereo provided): `https://webfiles.york.ac.uk/OPENAIR/IRs/innocent-railway-tunnel/mono/middle_tunnel_4way_mono.wav` (1ch 96kHz/24-bit; multiple entrance/middle positions, 1-way & 4-way)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/innocent-railway-tunnel/innocent-railway-tunnel.zip` (63.2 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net"**

### 13. Hamilton Mausoleum (Scotland — famous 15-second echo) — Chamber
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=502`
- Stereo WAV: `https://webfiles.york.ac.uk/OPENAIR/IRs/hamilton-mausoleum/stereo/hm2_000_ortf_48k.wav` (2ch 48kHz/24-bit, 4.1 MB)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/hamilton-mausoleum/hamilton-mausoleum.zip` (19.1 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net · Audiolab, University of York · Damian T. Murphy"**

### 14. Tyndall Bruce Monument (Fife, Scotland) — Weird
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=764`
- Stereo WAV: `https://webfiles.york.ac.uk/OPENAIR/IRs/tyndall-bruce-monument/stereo/tyndall_bruce_ortf.wav` (2ch 48kHz/24-bit, 1.3 MB)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/tyndall-bruce-monument/tyndall-bruce-monument.zip` (5.6 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net · Audiolab, University of York · Dr. Damian T. Murphy"**

### 15. T2 Hangar, Yorkshire Air Museum — Weird
- Page: `https://www.openair.hosted.york.ac.uk/?page_id=1274`
- B-format WAV (no stereo provided): `https://webfiles.york.ac.uk/OPENAIR/IRs/air-museum/b-format/AR_bformat_S1R1_1.wav` (4ch 44.1kHz/24-bit; also `AM_spist_*` spaced-pair files)
- Full ZIP: `https://webfiles.york.ac.uk/OPENAIR/IRs/air-museum/air-museum.zip` (18.5 MB)
- License: **CC BY 4.0**
- Attribution: **"www.openairlib.net"**

---

## Rejected (do NOT bundle)

| Room | Reason |
|------|--------|
| **Usina del Arte Symphony Hall** (Buenos Aires) `?page_id=770` | Page carries a genuine second `rel="license"` link to **CC BY-SA 3.0** ("Attribution Share Alike", `licenses/by-sa/3.0/`) alongside the generic footer badge. Share-alike is viral — **excluded** per rule. Attribution would have been "www.untref.edu.ar". If you want this hall, contact UNTREF for a commercial/relicense grant. |

### Also reviewed but not selected (not rejected on license — just not prioritized)
Many other CC BY 4.0 rooms exist in the catalog (e.g. St Patrick's Church Patrington,
Heslington Church, St Matthew's Walsall, Falkland Palace Royal Tennis Court / Bottle
Dungeon, Creswell Crags, Gill Heads Mine, Hoffmann Lime Kiln, Troller's Gill, Newgrange,
Spokane Woman's Club, 1st Baptist Church Nashville, Clifford's Tower, York Guildhall
Council Chamber, Ron Cooke Hub, Arthur Sykes Rymer Auditorium, Alcuin College, Theatre@41).
They share the same CC BY 4.0 footer; verify each individually before bundling using the
same method (read `?page_id`, confirm the only `rel="license"` link is `by/4.0`).

## Suggested bundle-manifest attribution line (all rooms)
> Impulse responses from OpenAIR (openairlib.net), Department of Electronic Engineering,
> University of York. Licensed under Creative Commons Attribution 4.0 International
> (CC BY 4.0). Individual room credits: see per-room attribution above.

## Verification method (for re-checking later)
```bash
# License page (via Wayback while host is suspended):
curl -sL "https://web.archive.org/web/2020/https://www.openair.hosted.york.ac.uk/?page_id=797" \
  | grep -oiE "creativecommons.org/licenses/[a-z-]+/[0-9.]+/"   # must show ONLY by/4.0

# File is live + returns 200:
curl -sI "https://webfiles.york.ac.uk/OPENAIR/IRs/york-minster/stereo/minster1_000_ortf_48k.wav"

# Browse a room's formats (Apache autoindex):
curl -s "https://webfiles.york.ac.uk/OPENAIR/IRs/york-minster/stereo/"
```

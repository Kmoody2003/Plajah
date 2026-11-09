# Fabula Disc Authoring — Blu-ray + UHD, burn or press

Goal: a filmmaker on Plajah builds a real Blu-ray or 4K Ultra HD Blu-ray inside Fabula
(menus, chapters, audio/subtitle tracks, extras, series), then picks a **destination** and
gets the right output for it:

| Destination | Medium | Output | Copy protection | Who makes it |
|---|---|---|---|---|
| Burn · print on demand | BD-R 25/50, BD-R XL 66/100 | BDMV folder → UDF 2.50 ISO | none (not required on BD-R) | Plajah burn station / duplicator (1-piece min) |
| Burn · short run | same | ISO + label art + job sheet | none | duplicators (Duplication.com, Bison, Disc Makers) |
| Press · retail | BD-ROM 25/50, UHD 50/66/100 | BDMV + ISO + press package (replicator premasters to CMF) | AACS (BD) / AACS 2 (UHD), arranged via replicator | licensed replicator (500–1000 min) |

We write our own engine. No third-party authoring app is in the loop.

## Architecture (`services/disc/`)

```
project.ts    DiscProject: titles (feature, episodes, extras), chapters, audio/sub tracks,
              menus (pages, buttons, nav, actions), first-play, top menu, pop-up menu, destination
spec.ts       format law: BD + UHD resolutions/rates/codecs, bitrate ceilings, disc capacities,
              stream limits, graphics plane (UHD graphics stay 1920×1080), destinations
budget.ts     capacity planner: runtime × tracks × overhead → video bitrate per title, fits/doesn't
validate.ts   compliance per destination (burn vs press vs retail): codecs, rates, bitrates, menu
              reachability, licensing flags (Dolby Vision, DTS/TrueHD encoders, AACS, logo use)
encode.ts     ffmpeg recipes for the desktop engine: x264 Blu-ray-compat (H.264 HP@4.1),
              x265 UHD-BD (HEVC Main10, HDR10 mastering metadata), AC-3 / LPCM audio
templates.ts  ready menus: Feature, Feature UHD, Series box set, Concert, Short film, Festival screener
hdmv.ts       HDMV navigation commands (12-byte instructions) + assembler
bits.ts       bit writer/reader
palette.ts    RGBA → 255-colour YCbCr palette (BT.709), transparency index 0xFF
rle.ts        Blu-ray graphics run-length coder (shared by PGS + IG)
pgs.ts        Presentation Graphics (subtitles) → .sup: PCS/WDS/PDS/ODS/END + parser
ig.ts         Interactive Graphics (menus) → ICS pages/BOGs/buttons/states + ODS/PDS + parser
navigation.ts project → movie objects, playlists, IG pages with button commands
bdmv.ts       index.bdmv, MovieObject.bdmv, MPLS playlists (+ parsers for round-trip tests)
menuTela.ts   menu page ⇄ Tela VECTOR doc (design in Tela, buttons carry role BUTTON:<id>)
destination.ts burn job sheet / press package manifest (AACS order checklist, label/print specs)
```

UI: `components/fabula/DiscAuthoring.tsx` — Fabula workspace **DISC** next to DELIVER.
Left: disc tree (first play, menus, titles, extras). Centre: menu canvas with button nav
arrows, safe areas, remote simulator. Right: inspector. Bottom: capacity bar + compliance.

## Phases

**Phase 1 (this build)** — project model, spec, budget, validator, templates, encode recipes,
HDMV assembler, PGS + IG encoders (round-trip tested against our own parsers), index/MovieObject/
MPLS writers, Tela menu hand-off, Fabula DISC workspace with remote simulator.

**Phase 2 — built 2026-11-08.** `ts.ts` (demux ffmpeg's per-stream TS, keeps PTS/DTS), `m2ts.ts`
(192-byte packets, ATS, PAT/PMT + HDMV registration, PCR ≤40 ms incl. idle gaps, PES re-based to
0.6 s, 6144-byte aligned units, EP map), `clpi.ts` (clip info + coarse/fine EP map), `clipMux.ts`,
`discWriter.ts` (encode → menu clips → mux → navigation with real clip lengths → ISO → burn),
`DiscImageService.cs` (IMAPI2: `disc_recorders`, `disc_make_iso` UDF 2.50, `disc_burn` + verify).
Verified: libbluray (ffprobe `bluray:`) opens a disc built end-to-end from the bundled ffmpeg and finds
H.264 + AC-3 + PGS at the right length; UHD HEVC Main10/PQ/BT.2020 + IG clip round-trips. Not yet
verified: hardware players, IMAPI imaging/burning on a real drive, T-STD buffer model (lead-time
scheduler only), SIT table. Original Phase 2 scope:
the muxer: our own BD-compliant M2TS muxer (192-byte packets, ATS, PAT/PMT/PCR,
PIDs 0x1011 video / 0x1100 audio / 0x1200 PGS / 0x1400 IG, T-STD buffer model), CLPI writer
with EP maps from the mux, full BDMV folder build on the desktop engine, UDF 2.50 ISO (IMAPI2
`IFileSystemImage` on Windows), BD-R / BD-R XL burn (IMAPI2), disc-label print (LightScribe-free
inkjet templates). Player matrix testing (PS5, Xbox, Panasonic UB, Sony UBP, LG, Magnetar).

**Phase 3** — retail press: press package for replicators who accept ISO/BDMV and premaster to
CMF themselves (the CMF writer needs the licensed BD verifier — out of reach without a BDA
format licence); AACS / AACS 2 title order checklist; replicator handoff (OMM, Duplication.com);
packaging (Amaray/Elite/steelbook art templates in Tela print stack, UPC from Label Desk).
Print-on-demand storefront: disc buy button on Cinema titles, money straight to the filmmaker
(no held money), burn-station job queue.

**Phase 4** — pro extras: BD-J menus, seamless branching / multi-angle, secondary video (PiP
commentary), Dolby Vision (needs Dolby licence), lossless audio encoders (TrueHD/DTS-HD need
licences — LPCM is the free lossless path and is what we default to).

## Honest limits

- Home-burned UHD discs play on most UHD players, not all. We keep a tested-player list.
- Pressed discs need a replicator's AACS licence; we don't hold one and don't fake one.
- "Blu-ray Disc" logo needs a BDA licence — UI and packaging say "plays in Blu-ray players".
- Dolby Vision, Dolby TrueHD, DTS-HD MA encoders are licensed — gated, never silently shipped.

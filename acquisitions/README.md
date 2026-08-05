# Plajah Heritage Archive — First Acquisitions Kit

Everything needed to pull the museum's first real holdings into your own storage, legally, with rights metadata on every file.

## What's in the box
- **acquisitions-manifest.json** — verified sources: all four Newberry *Beni Hasan* volumes on the Internet Archive (Vol. II is the priority — it contains the Baqet III and Khety tomb wrestling plates), plus the Met Open Access CC0 batch definition.
- **ingest.mjs** — zero-dependency Node 18+ script. Downloads the Beni Hasan PDFs (and page-image JP2 bundles when available), then queries the live Met Collection API — resolving departments by name, filtering strictly to `isPublicDomain: true` — and downloads CC0 artifact images (shields, staff weapons, Egyptian reliefs, African shields/staffs). Every asset gets a `.rights.json` sidecar matching the museum's Firestore `rights` schema.

## Run it
```bash
cd plajah-acquisitions
node ingest.mjs                # everything → ./holdings
node ingest.mjs --ia-only      # just Beni Hasan volumes
node ingest.mjs --met-only --met-limit 40
```

## Then
1. Upload `./holdings` to Firebase Storage.
2. Import the `*.rights.json` sidecars into a Firestore collection (e.g. `archiveAssets`).
3. From the Vol. II PDF/JP2s, extract the wrestling-sequence plates as individual images — those become the hero assets of the Egypt/Tahtib accession in the Combat Atlas.

## Legal posture (why this batch is safe)
- Beni Hasan volumes: published 1893–1900 → public domain; scans hosted by Internet Archive.
- Met images: script only takes objects the Met itself flags `isPublicDomain` under its CC0 Open Access program — unrestricted use including commercial; attribution appreciated, not required (the sidecars include it anyway).
- The manifest's `citationOnlyShelf` lists what must NOT be ingested (Desch-Obi, Green, EJMAS Kronos) — cite and summarize only.

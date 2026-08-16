# Plajah Academia — Teacher Integrity Wall + OER Assignment Library

v1 implementation matching `docs/design-schema.md` (see the schema doc
shared earlier). Built for Plajah's stack: React/TypeScript/Vite +
Capacitor (Android) + Firebase/Firestore + Cloud Functions.

## What's here

```
firestore.rules                     Integrity Wall at the data layer
functions/src/index.ts              conflictCheck · setSilentMode · validateTemplateLicenses
functions/src/hash.ts               Salted student-ref hashing (district SDK + server)
src/types/schema.ts                 Shared types — single source of truth
src/lib/integrity/silentMode.ts     Campus Silent Mode engine (geofence + schedule, fails closed)
src/lib/licensing/licenseGate.ts    CC license gating for commercial use
src/lib/standards/taxonomy.ts       CCSS/NGSS spine + PISA overlay helpers
src/components/integrity/           SilentModeInterstitial · DisclosureAssist
src/components/templates/           TemplateEditor (live license gate in UI)
scripts/ingest/                     openstax (CC-BY) · gutenberg (PD) · ck12-links (BY-NC, free tier only)
data/templates/seed-templates.json  Six subjects, rubrics + PISA overlay included
data/standards/pisa-levels.json     PISA proficiency descriptors (paraphrased, for calibration)
```

## The two invariants everything hangs on

1. **Persona wall.** No Independent-persona code path can read
   `districtPersona/*`. The only bridge is the `conflictCheck` Cloud
   Function, which returns booleans, never records. Rosters are salted
   hashes with term expiry — raw student identity never reaches Plajah.

2. **License wall.** `CC-BY-NC` / `CC-BY-NC-SA` content (CK-12,
   EngageNY) can never attach to a paid offering. Enforced three times:
   in the editor UI (`licenseGate.ts`), server-side
   (`validateTemplateLicenses`), and in `firestore.rules`.

## Wiring into Plajah

1. Merge `firestore.rules` into the existing ruleset (namespaced — no
   collisions with current collections).
2. `cd functions && npm i && npm run build && firebase deploy --only functions`
3. Instantiate `SilentModeEngine` in the creator-dashboard shell; render
   `SilentModeInterstitial` above it. Android geofencing upgrade path:
   swap the polling fallback for `@capacitor/geolocation` watchers +
   native geofence plugin when backgrounding matters.
4. Checkout flow calls `conflictCheck` before capturing payment on any
   paid offering. Blocked -> show the neutral message; never mention
   rosters.
5. Run ingest scripts with Firebase admin credentials to seed the
   library, then load `data/templates/seed-templates.json` via the
   admin SDK.

## Not legal advice

The disclosure letter, conflict scopes, and ethics framing implement
patterns from state ethics opinions and district policy research. Have
counsel review before launch, especially FERPA posture and the
district-configurable `blockScope` defaults.

## Known blocker (carried from prior sessions)

`src/theme/tokens.css` is placeholder-only. Plajah brand tokens have
still never been provided — swap that one file when they exist.

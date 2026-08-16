# Health integration

See ADR-0006 for the governing rule: vitals never affect who wins.

## Two paths, two jobs

**Live game input — BLE Heart Rate Profile, GATT service 0x180D.** The standard
profile every chest strap and most fitness watches broadcast. Sub-second data,
identical on both platforms, no companion app, no platform health permission.

**The durable record — HealthKit and Health Connect.** Written after the session so a
match appears in the person's own health app beside their runs.

## Why the platform APIs are not the live path

Health Connect is an on-device datastore with a permissions layer — a record, not a
feed. Live sensor data on Android requires Wear OS **Health Services**
(`ExerciseClient`, passive monitoring), which needs an app running on the watch.
On Apple, HealthKit alone will not stream live watch sensors; that requires
`HKWorkoutSession` / `HKLiveWorkoutBuilder` inside a **watchOS companion app**.

Capacitor builds neither watchOS nor Wear OS. Live vitals via platform APIs means two
native companion apps outside the existing toolchain — genuinely more work than the
phone client, which is why BLE is primary.

## Sampling reality

Apple Watch samples heart rate roughly every five seconds during a workout; Health
Services is similar. Vitals can therefore only drive band-level state over 15-30
second windows. `VitalsBand` is bucketed for this physical reason, not only for
privacy.

## Policy constraints to design around now

- HealthKit data cannot be used for advertising or sold; App Store review requires
  explicit purpose strings. Play has a comparable health-app declaration for
  restricted Health Connect types.
- The consent record therefore names specific data types — never a wildcard.
- Under-18 ingest is off. Child accounts under Family Sharing have restricted
  HealthKit behaviour and COPPA sits on top.

## What vitals actually do

Effort bands, distance, sprint counts and readiness feed a parallel progression:
streaks, personal records, weekly effort. None of it touches the scoreboard, and a
participant with no consent record plays a completely normal match.

# ADR-0006 — Vitals never affect who wins

**Status:** accepted · **Date:** 2026-08

## Context

Smart Health is the strongest repositioning available: once movement is the input,
this stops being a toy gun and becomes a fitness game, which changes the retail
shelf, the parent's purchase justification, and most of the violence optics. The
temptation is to make it load-bearing — heart-rate zones charging abilities, recovery
gating loadouts.

But heart rate comes from a watch. Gating abilities on heart rate gates them on
owning a watch, which quietly makes fitness hardware the price of competitiveness on
the tier that is supposed to require no purchase at all.

There is also a physical limit: Apple Watch and Wear OS Health Services both sample
around every five seconds, so vitals can only ever drive band-level state over 15-30
second windows. Nothing here could gate a trigger pull even if it should.

## Decision

Vitals feed a parallel progression — effort, streaks, readiness — and never the
scoreboard. `VitalsBand.affectsScoring` is typed `false`.

Live data comes from BLE Heart Rate Profile (GATT 0x180D) directly, which works
identically on both platforms with no companion app. HealthKit and Health Connect are
the durable record, written after the session.

## Consequences

- The health layer can be absent entirely and the game is unaffected. Consent absent
  is a fully playable state.
- Under-18 health ingest is simply off — COPPA plus restricted child-account
  HealthKit behaviour makes anything else a bad trade for a non-load-bearing feature.
- Live watch data needs a Wear OS app and a watchOS companion, neither of which
  Capacitor builds. That is genuine scope and it is why BLE is the primary path.

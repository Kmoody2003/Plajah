# ADR-0005 — Certify hardware, do not manufacture it

**Status:** accepted · **Date:** 2026-08

## Context

Manufacturing means injection tooling before a unit sells, ASTM F963 toy safety and
CPSC compliance, FCC/CE per SKU, freight, warehousing, retail keystone margin,
returns, recalls, and a cash conversion cycle software never has. That is a different
company than the one being built, and it cannot run off a platform balance sheet.

## Decision

Adopt an MFi-style programme. Plajah publishes the protocol (hit registration,
reload, damage model), the pairing and anti-spoof spec, and the physical safety
requirements, then certifies third-party SKUs and licenses the "Plajah Compatible"
badge. Revenue is a per-SKU certification fee plus a cut of sessions played on
certified gear.

## Consequences

- Zero hardware margin, and therefore zero tooling, inventory or recall exposure.
- Certification needs teeth: per-SKU and per-unit revocation, sample testing, and a
  spec conservative enough that a competent partner can actually pass it.
- The badge is a quality liability — a bad licensee ships gear that breaks and the
  box says Plajah. Certification is an ongoing operation, not a one-time gate.
- Physical colour is part of the spec, not marketing. Minimum marking-colour ratio,
  no black/grey/metallic finishes, silhouette reviewed at fifty yards in poor light.

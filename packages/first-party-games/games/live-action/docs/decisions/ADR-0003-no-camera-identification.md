# ADR-0003 — Hits resolve from geometry, not from the camera

**Status:** accepted · **Date:** 2026-08

## Context

The obvious phone mechanic is to point the camera at someone and shoot. Registering
that hit requires identifying *who* is in frame. The options are face recognition
(BIPA in Illinois, CUBI in Texas, and a non-starter for minors), a visual marker on
a vest (which makes the free tier require a purchase), or clothing/pose
re-identification (fragile, and it collapses when two players wear the same team
shirt). None survives contact with a dark venue, a running player, or 30fps.

## Decision

The camera renders and re-anchors. It does not detect players.

A shot casts a ray from the shooter's server-known position along their device
bearing, checks it against the arena survey's obstructions, and resolves against
participants inside the cone. Cover works because the server knows the bar is at
those coordinates.

## Consequences

- The arena survey becomes load-bearing rather than decorative.
- Cone width becomes the balance dial: wide and forgiving on phone, narrow on gear.
- Position accuracy sets the game's speed. At metre-scale, a target is a blob, not a
  point — so this is objective play, not a twitch shooter. That suits mixed ages.
- Heading drift indoors is the real engineering risk. Magnetometers fail near steel
  and HVAC; visual relocalization against the surveyed room is the corrector. That
  is the camera's actual job.

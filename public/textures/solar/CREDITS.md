# Planet textures — attribution

These maps were **hot-linked from the three.js GitHub repo** until 2026-08-28, and
**eight of the thirteen had 404'd** — Mercury, Venus, Mars, Jupiter, Saturn, its
rings, Uranus and Neptune were all rendering untextured in production. They are now
self-hosted here.

## Sources

| Files | Source | Licence | Attribution required |
|---|---|---|---|
| `2k_mercury`, `2k_venus_atmosphere`, `2k_mars`, `2k_jupiter`, `2k_saturn`, `2k_saturn_ring_alpha`, `2k_uranus`, `2k_neptune`, `2k_sun`, `2k_moon`, `2k_stars_milky_way` | [Solar System Scope](https://www.solarsystemscope.com/textures/) — derived from NASA elevation and imagery | **CC-BY 4.0** | **Yes** |
| `earth_atmos_2048`, `earth_lights_2048`, `earth_clouds_1024`, `earth_normal_2048`, `earth_specular_2048` | three.js examples (NASA Visible Earth / Blue Marble) | Public domain (NASA imagery) | No |

## The attribution the licence requires

CC-BY 4.0 obliges us to credit Solar System Scope wherever these are used. The
Orrery renders this in its About / credits panel:

> Planetary maps © [Solar System Scope](https://www.solarsystemscope.com/textures/),
> CC-BY 4.0, derived from NASA elevation and imagery.

**Do not remove that line** without also replacing these textures. NASA's own imagery
is public domain and needs no credit, but Solar System Scope's *derived* maps do.

## Replacing them with higher resolution

Solar System Scope publishes 2k / 8k variants. 2k is the deliberate choice here — the
performance target is a Fire TV stick, and eleven 8k maps would be roughly 400 MB.
If you ever want 8k for a desktop-only tier, swap the URL prefix from `2k_` to `8k_`
and load it conditionally, never as the default.

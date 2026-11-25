"""
Pack the 100 new generic buildings (24 towers T01-T24 and 76 population buildings N01-N76, delivered 2026-11-16) for the game and turn their rosters into data for the placers.

Source: <...>/ironport-new-generics-100 (models/generic/<slug>_lod0|lod1.gltf+bin, generic-variants.json, new-tower-roster.md, new-generics-roster.md).
Output:
  public/games/apex/ironport/models/generic/<slug>_lod0.{gltf,bin}      (the v1 folder: the game and the placement tools read sizes here)
  public/games/apex/ironport/models-v3/generic/<slug>_lod0.{gltf,bin}   (the same files: these buildings are one set, not a v1/v3 pair)
  public/games/apex/region/generic_variants.json                        (material schemes per type, for the game)
  games/apex/tools/data/new_generics_roster.json                        (id, name, zone, type, height, footprint per slug, for infill_city.py / infill_rural.py)
Their textures are the shared tex-shared-* sets, which the game already maps to v3 (or v1). LOD1 is not packed: the game has one level of detail.
Usage: python tools/pack_new_generics.py "<...>/ironport-new-generics-100"
"""
import json, os, re, shutil, sys

SRC = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "..", "..", "..", "public", "games", "apex")
n = 0
refs = set()
for sub in ("models", "models-v3"):
    d = os.path.join(PUB, "ironport", sub, "generic")
    os.makedirs(d, exist_ok=True)
    for f in sorted(os.listdir(os.path.join(SRC, "models", "generic"))):
        if "_lod0" not in f:
            continue
        shutil.copy(os.path.join(SRC, "models", "generic", f), os.path.join(d, f))
        if sub == "models" and f.endswith(".gltf"):
            n += 1
            for im in json.load(open(os.path.join(d, f), encoding="utf8")).get("images", []):
                refs.add(im["uri"].rsplit("/", 1)[-1])
shutil.copy(os.path.join(SRC, "generic-variants.json"), os.path.join(PUB, "region", "generic_variants.json"))
print("packed", n, "models; textures referenced:", len({r.rsplit("_", 1)[0] for r in refs}), "sets")

roster = {}
cur = None
for doc in ("new-tower-roster.md", "new-generics-roster.md"):
    for line in open(os.path.join(SRC, doc), encoding="utf8"):
        m = re.match(r"### ([TN]\d+) — (.+)", line)
        if m:
            name = m.group(2).strip()
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "").replace("’", "")).strip("-")
            cur = roster[slug] = {"id": m.group(1), "name": name, "slug": slug}
            continue
        if not cur:
            continue
        k = re.match(r"- \*\*(Zone|Type|Height|Footprint|Style/Era|Gameplay):\*\* (.+)", line)
        if not k:
            continue
        key, val = k.group(1), k.group(2).strip()
        if key == "Height":
            h = re.match(r"([\d.]+) m(?: / (\d+) floors?)?", val)
            if h:
                cur["h"] = float(h.group(1)); cur["floors"] = int(h.group(2)) if h.group(2) else None
        elif key == "Footprint":
            f = re.match(r"([\d.]+) × ([\d.]+) m", val)
            if f:
                cur["w"], cur["d"] = float(f.group(1)), float(f.group(2))
        else:
            cur[key.lower().replace("/", "_").replace("style_era", "style")] = val
missing = [s for s in roster if not os.path.exists(os.path.join(PUB, "ironport", "models", "generic", s + "_lod0.gltf"))]
print("roster entries", len(roster), "without a model:", missing[:8])
os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
json.dump(roster, open(os.path.join(HERE, "data", "new_generics_roster.json"), "w"), indent=1)
zones = {}
for r in roster.values():
    zones[r.get("zone", "?")] = zones.get(r.get("zone", "?"), 0) + 1
print("zones", dict(sorted(zones.items(), key=lambda kv: -kv[1])))

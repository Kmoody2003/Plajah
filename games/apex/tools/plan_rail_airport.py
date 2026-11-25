"""
Write the first railways, stations, services and the lake-coast airport into region/user_map.json, as map-editor features, so they can be edited in the map editor (F2).
Features written here have ids starting 'gen-'; running this again replaces only those and leaves everything the user drew alone.

Guides: the satellite texture shows real rail on the east bank at the port (x 3700..4400, z 3300..4500) running north-east into the city; the west bank is farmland,
the Great Lake is to the west, the shipping river is 550..1000 m wide (bed -4 m) so the main line goes under it in a tunnel.
Usage:  python tools/plan_rail_airport.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HERE, "..", "..", "..", "public", "games", "apex", "region")
path = os.path.join(REG, "user_map.json")
um = json.load(open(path))
um["features"] = [f for f in um["features"] if not f["id"].startswith("gen-")]

def feat(id, type, kind, name, pts, note="", **extra):
    f = {"id": "gen-" + id, "type": type, "kind": kind, "name": name, "note": note, "pts": [[round(x), round(z)] for x, z in pts]}
    f.update(extra)
    return f

F = []

# ---- railways -------------------------------------------------------------------------------------------------------------------------
# Alignments come from tools/route_rail.py (grade, water and towns priced in). Main line: Halcyon Airport on the lake coast east across the farmland and the
# kettle hills to Southgate on the west bank, under the river, to Ironport Central. Port branch: freight, Southgate north to the ironworks and the port yards.
# Coastal branch: passenger, from the airport station west to the beach towns.
import math
routes = json.load(open(os.path.join(HERE, "data", "rail_routes.json")))

def along(route, frac):
    d = [0.0]
    for a, b in zip(route[:-1], route[1:]): d.append(d[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    t = d[-1] * frac
    for i in range(len(d) - 1):
        if d[i + 1] >= t:
            k = (t - d[i]) / max(1e-6, d[i + 1] - d[i])
            return (route[i][0] + (route[i + 1][0] - route[i][0]) * k, route[i][1] + (route[i + 1][1] - route[i][1]) * k)
    return tuple(route[-1])

def nearest(route, x, z):
    return min(route, key=lambda p: math.hypot(p[0] - x, p[1] - z))

main, port, coast = routes["main"], routes["port"], routes["coast"]
F.append(feat("rail-main", "rail", "double", "Lakeshore Main Line", main, service="mixed",
    note="Double-track main line. Tunnel under the shipping river (bed -4 m); level crossings with the farm roads."))
F.append(feat("rail-port", "rail", "single", "Port Branch", port, service="freight", note="Single-track freight branch to the Ironworks yard and the port yards on the west bank."))
F.append(feat("rail-coast", "rail", "single", "Coastal Branch", coast, service="passenger", note="Single-track passenger branch from Halcyon Airport to the beach towns."))

# ---- stations -------------------------------------------------------------------------------------------------------------------------
sg = nearest(main, 3150, 2330)
for id, kind, name, (x, z) in [
    ("st-airport", "station", "Halcyon Airport", main[0]),
    ("st-beach", "halt", "Halcyon Beach", coast[-1]),
    ("st-kettle", "halt", "Kettle Hills", along(main, 0.3)),
    ("st-farm", "halt", "Section Road", along(main, 0.58)),
    ("st-southgate", "station", "Southgate", sg),
    ("st-central", "station", "Ironport Central", main[-1]),
    ("st-ironworks", "freight", "Ironworks Yard", nearest(port, 3450, 100)),
    ("st-port", "freight", "Port Yards", port[-1]),
]:
    F.append(feat(id, "station", kind, name, [(x, z)]))

# ---- airport (west end first: landings come in over the lake) -----------------------------------------------------------------------------
RZ = 4380
F.append(feat("ap-runway", "airport", "runway", "Runway 09/27", [(-6500, RZ), (-3900, RZ)], note="2.6 km; arrivals over the lake, planes taxi to the apron on the inland side."))
F.append(feat("ap-apron", "airport", "apron", "Apron", [(-4900, 4050), (-4000, 4050), (-4000, 4180), (-4900, 4180)]))
F.append(feat("ap-terminal", "airport", "terminal", "Terminal", [(-4880, 3955), (-4020, 3955), (-4020, 4030), (-4880, 4030)]))
F.append(feat("ap-hangar-1", "airport", "hangar", "Hangar 1", [(-3930, 4070), (-3790, 4070), (-3790, 4150), (-3930, 4150)]))
F.append(feat("ap-hangar-2", "airport", "hangar", "Hangar 2", [(-3770, 4070), (-3630, 4070), (-3630, 4150), (-3770, 4150)]))
# road to the terminal from the end of the coast highway
F.append(feat("ap-road", "road", "avenue", "Airport Road", [(-5529, 4138), (-5420, 4020), (-5250, 3930), (-4900, 3915), (-4500, 3915), (-4050, 3915)]))

# ---- services (coverage points) ---------------------------------------------------------------------------------------------------------
for id, kind, x, z in [
    ("sv-fire-dense", "fire", 2950, 2480), ("sv-police-dense", "police", 3150, 2750), ("sv-school-dense", "school", 2700, 2900), ("sv-clinic-dense", "clinic", 3300, 2950),
    ("sv-fire-ind", "fire", 3700, 500), ("sv-fire-beach", "fire", -6250, 3450), ("sv-school-beach", "school", -6350, 3350), ("sv-fire-airport", "fire", -4950, 3900),
]:
    F.append(feat(id, "service", kind, kind.capitalize(), [(x, z)]))

um["features"].extend(F)
json.dump(um, open(path, "w"), separators=(",", ":"))
print("wrote", len(F), "features; map now has", len(um["features"]))

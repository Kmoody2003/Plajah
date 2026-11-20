"""
The Civic Riverfront Street Circuit (Kenne's two "Civic Riverfront Street Circuit" maps, 5.34 km, clockwise: the start/finish by the marina, the
riverwalk past the opera and the museum, the amphitheatre and the beach, chicanes, a riverwalk bridge; docs/apex-elohim/east-bank-masterplan.md).
Both maps cross a channel twice; on our map the civic riverfront faces an 800 m river, so the layout is synthesised to the same parts: a riverwalk leg
south along the promenade (inland of it, so the promenade, its palms and the embankment stay on the water side), a hairpin at the parklands, a
boulevard leg back north inland of the landmarks with a chicane by the museum and one by the amphitheatre, and a hairpin by the opera hall.

Reads region/civic_riverfront.json (the shoreline), writes region/civic_circuit.json: xz (clockwise), sectors (by point index, for hero spots).
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
REGION = os.path.join(HERE, '..', '..', '..', 'public', 'games', 'forth-horizon', 'region')
Z0, Z1 = -1850, 100  # the course runs along the bank from the opera hall's south side to the parklands
RIVERWALK, BOULEVARD = 48, 300  # metres inland of the water's edge: the riverwalk leg, the boulevard leg

def main():
    plan = json.load(open(os.path.join(REGION, 'civic_riverfront.json')))
    S = [p for p in plan['shore'] if Z0 - 100 <= p[1] <= Z1 + 100]
    def frame(z):
        # the shore point at z (linear), the direction along the bank (south) and inland (east-ish: the shore's normal away from the river, +x side)
        for i in range(len(S) - 1):
            a, b = S[i], S[i + 1]
            if a[1] <= z <= b[1]:
                t = (z - a[1]) / (b[1] - a[1]); x = a[0] + (b[0] - a[0]) * t
                L = math.hypot(b[0] - a[0], b[1] - a[1]); tx, tz = (b[0] - a[0]) / L, (b[1] - a[1]) / L
                nx, nz = tz, -tx                        # for a bank running south with the river to the west, (tz, -tx) points east, inland
                if nx < 0: nx, nz = -nx, -nz
                return x, z, nx, nz
        raise ValueError(z)
    def chicane(z, zc, amp):
        d = (z - zc) / 60.0
        return amp * math.exp(-d * d) * math.sin(d * 2.2)
    river, boul = [], []
    for z in range(Z0, Z1 + 1, 25):
        x, zz, nx, nz = frame(z)
        river.append((x + nx * RIVERWALK, zz + nz * RIVERWALK))
        off = BOULEVARD + chicane(z, -1450, 26) + chicane(z, -600, 22)
        boul.append((x + nx * off, zz + nz * off))
    # hairpins: a half circle at each end joining the legs
    def hairpin(a, b, out_dir):
        cx, cz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ; r = math.dist(a, b) / 2
        ang0 = math.atan2(a[1] - cz, a[0] - cx); pts = []
        for k in range(1, 12):
            t = k / 12; ang = ang0 + out_dir * math.pi * t
            pts.append((cx + math.cos(ang) * r, cz + math.sin(ang) * r))
        return pts
    # clockwise seen from above with the river to the west: south along the riverwalk, east and back north along the boulevard
    south = hairpin(river[-1], boul[-1], 1)
    north = hairpin(boul[0], river[0], 1)
    loop = river + south + list(reversed(boul)) + north
    # check the turn direction of the half circles: each must bulge away from the course (south end bulges south, north end north)
    def bulge_ok(arc, sign):
        mz = sum(p[1] for p in arc) / len(arc)
        return (mz - (river[-1][1] if sign > 0 else river[0][1])) * sign > 0
    if not bulge_ok(south, 1): south = hairpin(river[-1], boul[-1], -1)
    if not bulge_ok(north, -1): north = hairpin(boul[0], river[0], -1)
    loop = river + south + list(reversed(boul)) + north
    L = sum(math.dist(loop[i], loop[(i + 1) % len(loop)]) for i in range(len(loop)))
    nr, ns = len(river), len(south)
    # start/finish on the riverwalk by the marina (the maps put it alongside the marina)
    sectors = {'riverwalk': [0, nr], 'parklands_hairpin': [nr, nr + ns], 'boulevard': [nr + ns, nr + ns + len(boul)], 'opera_hairpin': [nr + ns + len(boul), len(loop)]}
    out = {'name': 'Civic Riverfront Street Circuit', 'kind': 'road_course', 'layout': 'Civic Riverfront Street Circuit (synthesised to the east bank)', 'length_m': round(L),
           'xz': [[round(x, 1), round(z, 1)] for x, z in loop], 'grade': [], 'sectors': sectors}
    f = os.path.join(REGION, 'civic_circuit.json')
    json.dump(out, open(f, 'w'), indent=1)
    print('wrote', f, len(loop), 'points,', round(L), 'm')

if __name__ == '__main__':
    main()

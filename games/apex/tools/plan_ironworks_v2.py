"""
The new Ironworks Industrial Circuit: Kenne's "North Harbor Industrial Raceway, Circuit II" layout (5.34 km, 20 turns, clockwise), traced from
D:\\plajah game assets deign from promtps\\racer\\industrial districts\\Industrial_race_circuit_map_layout_e69da15c.jpg and fitted onto the west bank
(the old Ironworks yards and west across the Port Branch) by a search over position and rotation that scored land, the harbour sector on the river
quay and where the line crosses the Port Branch (docs/apex-elohim/east-bank-masterplan.md).

Writes public/games/apex/region/industrial_circuit.json (the old route is kept as industrial_circuit.v1.json):
  xz        the centre line (map points, rotated 34.5 deg, scaled to 5.34 km; the game rounds the corners)
  grade     where the road leaves the ground: a bridge over the Port Branch (and the freight yard round it) and an underpass beneath it, as
            {kind, at: [x, z] of the crossing, clear: m over / under the rail, ramp: m each side}
  sectors   the map's sectors by centre-line index (for dressing): warehouse district, container port, harbour, refinery, rail yard, underpass
"""
import json, math, os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
REGION = os.path.join(HERE, '..', '..', '..', 'public', 'games', 'apex', 'region')

# the map's centre line (image pixels of the layout map, clockwise from the start straight), as traced from zoomed crops
P = [(400,184),(560,183),(700,183),(745,186),(762,208),(763,250),(748,275),(718,285),(697,302),(695,325),(712,338),(750,338),(778,350),(800,345),(822,318),(845,303),(900,322),(1000,357),(1100,395),(1145,410),(1160,432),(1140,452),(1100,455),(1050,462),(990,462),(950,450),(925,445),(910,470),(905,520),(905,590),(895,630),(865,655),(828,657),(790,642),(755,610),(738,575),(720,540),(695,510),(668,492),(630,492),(600,515),(575,510),(545,485),(480,478),(380,478),(280,478),(210,476),(165,462),(140,440),(138,400),(160,372),(190,358),(250,318),(300,280),(332,253),(340,225),(355,200),(380,186)]
ROT, CX, CZ, LENGTH = 34.5, 3460, 470, 5340

PORT_BRANCH = [[3164, 2332], [3435, 2160], [3740, 1986], [3838, 1687], [3694, 1406], [3514, 1162], [3307, 945], [3396, 668], [3490, 377], [3366, 60], [3149, -160], [3049, -469], [3111, -795], [3326, -1013], [3626, -1173], [3804, -1348]]

def place():
    L = sum(math.dist(P[i], P[(i + 1) % len(P)]) for i in range(len(P)))
    s = LENGTH / L
    mx = sum(p[0] for p in P) / len(P); my = sum(p[1] for p in P) / len(P)
    th = math.radians(ROT); c, sn = math.cos(th), math.sin(th)
    return [((CX + (px - mx) * s * c - (py - my) * s * sn), (CZ + (px - mx) * s * sn + (py - my) * s * c)) for px, py in P]

def crossings(W):
    out = []
    for i in range(len(W)):
        a, b = W[i], W[(i + 1) % len(W)]
        for k in range(len(PORT_BRANCH) - 1):
            c, d = PORT_BRANCH[k], PORT_BRANCH[k + 1]
            den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
            if abs(den) < 1e-9: continue
            t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
            u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
            if 0 <= t <= 1 and 0 <= u <= 1: out.append((i, (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)))
    return out

def main():
    W = place()
    xs = crossings(W)
    assert len(xs) == 2, xs
    # the first crossing on the lap (the refinery stretch) is the bridge over the freight yard; the one just before the start straight is the underpass
    (ib, pb), (iu, pu) = sorted(xs)
    grade = [
        {'kind': 'bridge', 'at': [round(pb[0], 1), round(pb[1], 1)], 'clear': 7.5, 'ramp': 150},
        {'kind': 'underpass', 'at': [round(pu[0], 1), round(pu[1], 1)], 'clear': 6.8, 'ramp': 130},
    ]
    sectors = {'warehouse': [0, 16], 'container_port': [16, 20], 'harbour': [20, 27], 'refinery': [27, 41], 'rail_yard': [41, 50], 'underpass': [50, 58]}
    out = {'name': 'Ironworks Industrial Circuit', 'kind': 'road_course', 'layout': 'North Harbor Industrial Raceway, Circuit II', 'length_m': LENGTH,
           'xz': [[round(x, 1), round(z, 1)] for x, z in W], 'grade': grade, 'sectors': sectors}
    f = os.path.join(REGION, 'industrial_circuit.json')
    v1 = os.path.join(REGION, 'industrial_circuit.v1.json')
    if not os.path.exists(v1): shutil.copy(f, v1)
    json.dump(out, open(f, 'w'), indent=1)
    print('crossings', xs)
    print('wrote', f, len(W), 'points')

if __name__ == '__main__':
    main()

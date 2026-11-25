"""
The Harbor District Street Circuit: Kenne's "Harbor District Street Circuit" layout (5.42 km, 20 turns, clockwise), traced from
D:\\plajah game assets deign from promtps\\racer\\industrial districts\\Race_circuit_architectural_layou..._3e28c21f.jpg and fitted onto the east shore of
the strait north of the river mouth (the north end of the east bank, clear of the civic riverfront) by a search that kept the course on land except its
pier and wharf sections, which may stand out over the water up to 150 m from the shore (docs/apex-elohim/east-bank-masterplan.md).

Writes public/games/apex/region/harbor_circuit.json: xz (the centre line), sectors (by point index, for dressing). No railway on this course.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
REGION = os.path.join(HERE, '..', '..', '..', 'public', 'games', 'apex', 'region')

# the map's centre line (layout image pixels, clockwise from the start straight), traced from zoomed crops
P = [(420,490),(520,525),(640,565),(730,605),(800,640),(850,635),(900,590),(960,520),(1030,440),(1090,360),(1130,300),(1150,255),(1125,215),(1075,190),(1025,195),(990,230),(960,285),(925,350),(885,420),(845,480),(805,515),(760,512),(700,492),(630,465),(560,440),(505,410),(490,360),(495,300),(515,260),(560,240),(640,250),(690,235),(700,190),(690,130),(650,100),(560,95),(470,100),(425,125),(415,170),(420,210),(400,232),(350,255),(280,290),(225,325),(190,360),(200,400),(250,425),(330,450),(380,470)]
ROT, CX, CZ, LENGTH = 288.5, 7370, -2960, 5420

def main():
    L = sum(math.dist(P[i], P[(i + 1) % len(P)]) for i in range(len(P)))
    s = LENGTH / L
    mx = sum(p[0] for p in P) / len(P); my = sum(p[1] for p in P) / len(P)
    th = math.radians(ROT); c, sn = math.cos(th), math.sin(th)
    W = [(CX + (px - mx) * s * c - (py - my) * s * sn, CZ + (px - mx) * s * sn + (py - my) * s * c) for px, py in P]
    # sectors for the dressing (src/ironworksDistrict.ts names): the pit straight between warehouses, the east pier among containers and cranes, the dock
    # basin straight and the wharf loop on the quay, the top straight past the north terminal's stacks, the chicane and west hairpin by the warehouses
    sectors = {'warehouse': [0, 5], 'container_port': [5, 21], 'harbour': [21, 36], 'container_yard': [36, 41], 'underpass': [41, 49]}
    out = {'name': 'Harbor District Street Circuit', 'kind': 'road_course', 'layout': 'Harbor District Street Circuit', 'length_m': LENGTH,
           'xz': [[round(x, 1), round(z, 1)] for x, z in W], 'grade': [], 'sectors': sectors}
    f = os.path.join(REGION, 'harbor_circuit.json')
    json.dump(out, open(f, 'w'), indent=1)
    print('wrote', f, len(W), 'points; extent x', round(min(w[0] for w in W)), round(max(w[0] for w in W)), 'z', round(min(w[1] for w in W)), round(max(w[1] for w in W)))

if __name__ == '__main__':
    main()

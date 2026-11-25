"""Route the Ironport Grand Circuit along real street centrelines (named intersections as waypoints)."""
import heapq
import json
import math
import os
import sys
import real_city as rc

HERE = rc.HERE
DOCS = rc.DOCS

d = json.load(open(os.path.join(HERE, "data", "detroit_streets.json")))
SEGS = []
for s in d["streets"]:
    name = (s.get("name") or "").upper()
    if any(k in name for k in ("RAMP", "FWY", " I 75", " I 375", " M 10", "CONN", "TURNAROUND", "SERVICE")):
        continue
    pts = [rc.ll_to_canvas(lon, lat) for lon, lat in s["geometry"]["coordinates"]]
    SEGS.append((name, pts))

NODES = {}
ADJ = {}


def nid(p):
    k = (round(p[0] * 0.5), round(p[1] * 0.5))   # merge nodes within ~1.5 m
    if k not in NODES:
        NODES[k] = p
        ADJ[k] = []
    return k


for name, pts in SEGS:
    for a, b in zip(pts[:-1], pts[1:]):
        ka, kb = nid(a), nid(b)
        if ka == kb:
            continue
        w = math.hypot(a[0] - b[0], a[1] - b[1]) * rc.MPC
        ADJ[ka].append((kb, w, name))
        ADJ[kb].append((ka, w, name))


def nearest_node(p):
    return min(NODES, key=lambda k: (NODES[k][0] - p[0]) ** 2 + (NODES[k][1] - p[1]) ** 2)


def intersection(a, b):
    """Node where street a meets street b (node on a closest to any node on b)."""
    na = {k for k, edges in ADJ.items() if any(e[2] == a for e in edges)}
    nb = {k for k, edges in ADJ.items() if any(e[2] == b for e in edges)}
    best = None
    for k in na:
        for j in nb:
            dd = (NODES[k][0] - NODES[j][0]) ** 2 + (NODES[k][1] - NODES[j][1]) ** 2
            if best is None or dd < best[0]:
                best = (dd, k)
    return best[1]


def route(k0, k1, avoid=None):
    dist = {k0: 0.0}
    prev = {}
    pq = [(0.0, k0)]
    while pq:
        dd, k = heapq.heappop(pq)
        if k == k1:
            break
        if dd > dist.get(k, 1e18):
            continue
        for j, w, nm in ADJ[k]:
            if avoid and (k, j) in avoid:
                continue
            nd = dd + w
            if nd < dist.get(j, 1e18):
                dist[j] = nd
                prev[j] = k
                heapq.heappush(pq, (nd, j))
    path = [k1]
    while path[-1] != k0:
        path.append(prev[path[-1]])
    return [NODES[k] for k in path[::-1]], dist[k1]


def build(wps):
    keys = [intersection(a, b) for a, b in wps]
    full, total = [], 0.0
    legs = []
    for i in range(len(keys)):
        a, b = keys[i], keys[(i + 1) % len(keys)]
        p, L = route(a, b)
        legs.append((wps[i], wps[(i + 1) % len(keys)], round(L)))
        full += p if not full else p[1:]
        total += L
    return full, total, legs


if __name__ == "__main__":
    WPS = json.loads(sys.argv[1]) if len(sys.argv) > 1 else [
        ["ATWATER ST", "RIOPELLE ST"], ["ATWATER ST", "BEAUBIEN ST"], ["E JEFFERSON AVE", "BEAUBIEN ST"],
        ["E JEFFERSON AVE", "WOODWARD AVE"], ["WOODWARD AVE", "E FORT ST"], ["MONROE ST", "BRUSH ST"], ["GRATIOT AVE", "BRUSH ST"],
    ]
    path, total, legs = build(WPS)
    print("total m", round(total))
    for l in legs:
        print(l)
    json.dump({"waypoints": WPS, "canvas": path, "length_m": total}, open(os.path.join(DOCS, "city-circuit-real.json"), "w"))

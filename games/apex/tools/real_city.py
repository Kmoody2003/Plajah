"""Shared transform and data access for the real-Detroit city plan.

lon/lat -> river-left canvas (3 m per px, see city_plan_real.py) -> satellite canvas -> region map px
-> region world metres (x east, z south, origin at the region centre; 12 m per map px).
"""
import json
import math
import os
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DOCS = os.path.join(REPO, "docs", "apex-elohim")
PLAN = json.load(open(os.path.join(DOCS, "city-plan-real.json")))
X = PLAN["xform"]
KX = math.cos(math.radians(X["lat0"])) * 111320.0
KY = 110540.0
MPC = 3.0
CS, SN = math.cos(X["phi"]), math.sin(X["phi"])
# satellite canvas used by the region map (same numbers as city_plan.py)
_M = cv2.getRotationMatrix2D((1195.0, 455.0), 30.5, 4.0)
_M[0, 2] += 480 - 1195.0
_M[1, 2] += 780 - 455.0
MINV = cv2.invertAffineTransform(_M)
CM_REAL = PLAN["cm"]
# real Campus Martius lands on this satellite-canvas point (inside the dense downtown, shore aligned)
CM_SAT = (442.0, 895.0)
DX, DY = CM_SAT[0] - CM_REAL[0], CM_SAT[1] - CM_REAL[1]
W_MAP, H_MAP, MPP = 1376, 768, 12.0


def ll_to_canvas(lon, lat):
    e = (lon - X["lon0"]) * KX
    n = (lat - X["lat0"]) * KY
    u2 = n * CS - e * SN
    v2 = n * SN + e * CS
    return ((u2 - X["u0"]) / MPC, (v2 - X["vmin"]) / MPC + 20.0)


def canvas_to_world(cx, cy):
    sx, sy = cx + DX, cy + DY
    mx = MINV[0, 0] * sx + MINV[0, 1] * sy + MINV[0, 2]
    my = MINV[1, 0] * sx + MINV[1, 1] * sy + MINV[1, 2]
    return ((mx - W_MAP / 2) * MPP, (my - H_MAP / 2) * MPP)


def ll_to_world(lon, lat):
    return canvas_to_world(*ll_to_canvas(lon, lat))


def heading_world():
    """World-plane angle of the canvas +x axis (for orienting things aligned to the rotated grid)."""
    a = canvas_to_world(0, 0)
    b = canvas_to_world(100, 0)
    return math.atan2(b[1] - a[1], b[0] - a[0])


def in_region(x, z):
    return abs(x) < W_MAP * MPP / 2 - 60 and abs(z) < H_MAP * MPP / 2 - 60


def streets_world():
    d = json.load(open(os.path.join(HERE, "data", "detroit_streets.json")))
    out = []
    for s in d["streets"]:
        pts = [ll_to_world(lon, lat) for lon, lat in s["geometry"]["coordinates"]]
        out.append({"name": (s.get("name") or "").upper(), "pts": pts})
    return out

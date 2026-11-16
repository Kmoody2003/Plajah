"""Render the Ironport city plan as a stylised game map (Forza-style graphic, not a satellite)."""
import json
import math
import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DOCS = os.path.join(REPO, "docs", "apex-elohim")
K = 3  # render px per canvas px (1 px per metre)

BG = (30, 37, 48)
BLOCK = (46, 55, 69)
BLOCK_EDGE = (58, 69, 86)
PARK = (47, 86, 68)
WATER = (22, 66, 94)
WATER_EDGE = (74, 150, 190)
RAIL = (130, 120, 108)
ST_CASE = (18, 22, 30)
ST_FILL = (196, 203, 214)
ART_FILL = (255, 196, 84)
FWY_FILL = (255, 142, 64)
TEXT = (230, 236, 245)


def font(sz, bold=True):
    for n in ("bahnschrift.ttf", "arialbd.ttf" if bold else "arial.ttf"):
        try:
            return ImageFont.truetype(n, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def P(pts):
    return [(float(x) * K, float(y) * K) for x, y in pts]


def line(d, pts, width_m, fill, mpc=3.0):
    w = max(int(round(width_m / mpc * K)), 1)
    d.line(P(pts), fill=fill, width=w, joint="curve")
    r = w / 2
    for p in (pts[0], pts[-1]):
        x, y = p[0] * K, p[1] * K
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def road(d, pts, width_m, fill):
    line(d, pts, width_m + 5, ST_CASE)
    line(d, pts, width_m, fill)


def label_on(img, text, a, b, fnt, fill=TEXT):
    ang = math.degrees(math.atan2(-(b[1] - a[1]), b[0] - a[0]))
    if ang > 90: ang -= 180
    if ang < -90: ang += 180
    tw = int(ImageDraw.Draw(img).textlength(text, font=fnt)) + 16
    t = Image.new("RGBA", (tw, fnt.size + 14), (0, 0, 0, 0))
    td = ImageDraw.Draw(t)
    td.text((8, 4), text, font=fnt, fill=(14, 18, 26, 255), stroke_width=3, stroke_fill=(14, 18, 26, 255))
    td.text((8, 4), text, font=fnt, fill=fill + (255,))
    t = t.rotate(ang, expand=True, resample=Image.BICUBIC)
    cx, cy = (a[0] + b[0]) / 2 * K, (a[1] + b[1]) / 2 * K
    img.alpha_composite(t, (int(cx - t.width / 2), int(cy - t.height / 2))) if img.mode == "RGBA" else img.paste(t, (int(cx - t.width / 2), int(cy - t.height / 2)), t)


def render(plan, circuit=None, out_name="city-map.png"):
    W, H = plan["W"], plan["H"]
    img = Image.new("RGBA", (W * K, H * K), BG + (255,))
    d = ImageDraw.Draw(img)

    # port / yards
    if plan.get("land"):
        d.polygon(P(plan["land"]), fill=BLOCK)
    if plan.get("port"):
        d.polygon(P(plan["port"]), fill=(40, 46, 58))
    if plan.get("rail_yard"):
        d.polygon(P(plan["rail_yard"]), fill=(52, 50, 52))
    # blocks
    for b in plan.get("blocks", []):
        x0, y0, x1, y1 = b["rect"]
        fill = PARK if b["green"] > 0.55 else BLOCK
        d.rectangle([x0 * K, y0 * K, x1 * K, y1 * K], fill=fill, outline=BLOCK_EDGE if fill == BLOCK else None)
    for pk in plan.get("parks", []):
        d.polygon(P(pk), fill=PARK)
    # water
    for w in plan["water"]:
        d.polygon(P(w), fill=WATER)
    wl = Image.new("L", img.size, 0)
    wd = ImageDraw.Draw(wl)
    for w in plan["water"]:
        wd.line(P(w + [w[0]]), fill=255, width=10 * K // 2)
    glow = wl.filter(ImageFilter.GaussianBlur(10))
    img.paste(Image.new("RGBA", img.size, WATER_EDGE + (255,)), (0, 0), glow.point(lambda v: int(v * 0.55)))
    d = ImageDraw.Draw(img)
    for w in plan["water"]:
        d.line(P(w + [w[0]]), fill=WATER_EDGE, width=3)

    # rail
    if plan.get("rail"):
        line(d, plan["rail"], 36, (60, 58, 60))
        line(d, plan["rail"], 5, RAIL)
    # streets
    for s in plan["streets"]:
        if s["cls"] == "street":
            road(d, s["pts"], 10, ST_FILL)
        elif s["cls"] == "ramp":
            road(d, s["pts"], 9, (255, 170, 100))
    for s in plan["streets"]:
        if s["cls"] == "arterial":
            road(d, s["pts"], 19, ART_FILL)
    for s_ in plan.get("freeways", []):
        road(d, s_["pts"], 15, FWY_FILL)
    if plan.get("freeway"):
        road(d, plan["freeway"], 38, FWY_FILL)
    if plan.get("freeway2"):
        road(d, plan["freeway2"], 34, FWY_FILL)
    for r in plan.get("ramps", []):
        x, y, rr = r["c"][0] * K, r["c"][1] * K, r["r"] * K
        d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=ST_CASE, width=int(9 * K / 3 * 1.6))
        d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=FWY_FILL, width=int(6 * K / 3 * 1.2))

    # circuit overlay
    if circuit:
        for idx, c in enumerate(circuit):
            col = c.get("color", (60, 230, 230))
            line(d, c["pts"], 26, (10, 14, 20))
            line(d, c["pts"], 20, col)
            line(d, c["pts"], 2, (255, 255, 255))
    # labels
    f1, f2 = font(34), font(26)
    best = {}
    for s in plan["streets"]:
        if s["name"] and s["cls"] == "arterial":
            ln = sum(math.hypot(s["pts"][i + 1][0] - s["pts"][i][0], s["pts"][i + 1][1] - s["pts"][i][1]) for i in range(len(s["pts"]) - 1))
            if ln > best.get(s["name"], (0, None))[0]:
                best[s["name"]] = (ln, s)
    for _, s in best.values():
        if s["name"]:
            pts = s["pts"]
            if len(pts) > 20:
                a, b = pts[len(pts) // 3], pts[len(pts) // 3 + 3]
            else:
                a, b = pts[0], pts[-1]
                a, b = ((a[0] * 2 + b[0]) / 3, (a[1] * 2 + b[1]) / 3), ((a[0] + b[0] * 2) / 3, (a[1] + b[1] * 2) / 3)
            label_on(img, s["name"], a, b, f2 if s["cls"] == "street" else f1, (255, 244, 214))
    return img


if __name__ == "__main__":
    plan = json.load(open(os.path.join(DOCS, "city-plan.json")))
    img = render(plan)
    out = os.path.join(DOCS, "city-map-plan.png")
    img.convert("RGB").save(out)
    small = img.convert("RGB").resize((img.width // 3, img.height // 3), Image.LANCZOS)
    small.save(os.path.join(DOCS, "_city-map-plan-preview.png"))
    print(img.size)

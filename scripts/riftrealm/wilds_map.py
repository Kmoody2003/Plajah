"""Rift Realm — Elderwood Wilds: label the top-down render of the world (D:/rr_work/wilds/game/map.png, from
wilds_shots.mjs with CAMS="map:0,2400,1,0,0,0,46,6000") with the places, trails, river and regions from
games/rift-realm/src/world/layout.ts → docs/rift-realm-wilds-map.jpg."""
import math, os, re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = open(os.path.join(ROOT, "games/rift-realm/src/world/layout.ts"), encoding="utf-8").read()
places = [(m[0], m[1], float(m[2]), float(m[3])) for m in re.findall(r"\{ id: '([^']+)', name: '([^']+)', region: '[^']+', x: (-?[\d.]+), z: (-?[\d.]+)", src)]
river = [tuple(map(float, m)) for m in re.findall(r"\[(-?\d+), (-?\d+), -?[\d.]+, [\d.]+\]", src.split("export const RIVER")[1].split("];")[0])]
stream = [tuple(map(float, m)) for m in re.findall(r"\[(-?\d+), (-?\d+), -?[\d.]+, [\d.]+\]", src.split("export const POOL_STREAM")[1].split("];")[0])]
trails = [[tuple(map(float, p)) for p in re.findall(r"\[(-?\d+), (-?\d+)\]", t)] for t in re.findall(r"\[(\[-?\d+, -?\d+\](?:, \[-?\d+, -?\d+\])+)\]", src.split("export const TRAILS")[1].split("];")[0])]

im = Image.open("D:/rr_work/wilds/game/map.png").convert("RGB")
N = im.width
half = 2400 * math.tan(math.radians(23))
P = lambda x, z: (N / 2 + x / half * N / 2, N / 2 + z / half * N / 2)
ov = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
d.rectangle([0, 0, N, N], fill=(0, 0, 0, 70))
def font(n, b=True):
    for f in (("segoeuib.ttf" if b else "segoeui.ttf"), "arialbd.ttf", "arial.ttf"):
        try: return ImageFont.truetype(f, n)
        except OSError: pass
    return ImageFont.load_default()
F, FS, FR = font(17), font(13, False), font(30)
# escarpment edge
def escz(x):
    sm = lambda a, b, v: (lambda t: t * t * (3 - 2 * t))(min(1, max(0, (v - a) / (b - a))))
    bump = sm(80, 120, x) * (1 - sm(280, 320, x))
    return 335 + 22 * math.sin(x / 150 + 0.6) + 215 * bump
d.line([P(x, escz(x)) for x in range(-950, 951, 10)], fill=(255, 190, 90, 200), width=3)
for t in trails: d.line([P(*p) for p in t], fill=(240, 230, 200, 150), width=2)
d.line([P(*p) for p in river], fill=(80, 220, 255, 255), width=6)
d.line([P(*p) for p in stream], fill=(80, 220, 255, 220), width=3)
c0, c1 = P(-76, -76), P(76, 76); d.rectangle([c0, c1], outline=(120, 255, 200, 230), width=3)
d.text((c0[0] + 4, c1[1] + 4), "ELDERWOOD HOLLOW (CF-24)", fill=(120, 255, 200, 255), font=FS)
for txt, x, z in [("HIGH CANOPY", -60, -330), ("WESTWOOD", -470, -10), ("REDWOOD RUINS", 360, -330), ("HIGHLAND", -200, -640), ("VIOLET VALE", -60, 700), ("THE GORGE", 250, 500), ("MANGROVE MIRE", -460, 560)]:
    d.text(P(x, z), txt, fill=(255, 255, 255, 120), font=FR)
for pid, name, x, z in places:
    if pid in ("oak-roots", "west-bridge", "mossy-floor"): continue
    px, pz = P(x, z)
    d.ellipse([px - 6, pz - 6, px + 6, pz + 6], fill=(255, 210, 90, 255), outline=(20, 20, 20, 255), width=2)
    d.text((px + 9, pz - 10), name, fill=(255, 245, 220, 255), font=F, stroke_width=3, stroke_fill=(0, 0, 0, 255))
# scale bar + north
x0, y0 = 40, N - 50; L = 500 / half * N / 2
d.line([(x0, y0), (x0 + L, y0)], fill=(255, 255, 255, 255), width=4); d.text((x0, y0 - 24), "500 m", fill=(255, 255, 255, 255), font=F)
d.text((N - 60, 30), "N ↑", fill=(255, 255, 255, 255), font=FR)
d.text((40, 24), "Elderwood Wilds — 2 km × 2 km", fill=(255, 255, 255, 255), font=FR)
d.text((40, 62), "gold: places from the art · cyan: river & falls · cream: trails · orange: escarpment (plateau above, vale 46 m below)", fill=(230, 230, 230, 255), font=FS)
out = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
out.save(os.path.join(ROOT, "docs", "rift-realm-wilds-map.jpg"), quality=84)
print("map", len(places), "places", len(trails), "trails")

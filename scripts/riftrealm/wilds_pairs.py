"""Rift Realm — Elderwood Wilds: pair every art shot with its in-game frame (art | game) into docs/rift-realm-wilds/.

  python scripts/riftrealm/wilds_pairs.py

Reads the shot list from games/rift-realm/src/world/shots.ts, the art from the Shooter asset folder (a frame from the video
for flythroughs), the game frames from D:/rr_work/wilds/game/<id>.(jpg|png). Also writes docs/rift-realm-wilds/index.jpg,
a contact sheet of every pair.
"""
import os, re, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = r"D:/plajah game assets deign from promtps/Shooter/"
GAME = r"D:/rr_work/wilds/game/"
OUT = os.path.join(ROOT, "docs", "rift-realm-wilds")
# the frame (seconds) of each flythrough that the in-game camera reproduces
VIDEO_T = {"titan-ramp": 2.6, "canopy-sniper": 6.8, "rift-vault": 6.5, "mangrove-mire": 2.0, "circuit-court": 5.5, "chapel-flythrough": 1.5}

src = open(os.path.join(ROOT, "games/rift-realm/src/world/shots.ts"), encoding="utf-8").read()
src = src.replace("'video:' + NOV + '", "'video:Nov 15 - 14_43/").replace("VS + '", "'void-sanctum-complete/void-sanctum/environment-shots/elderwood-hollow/").replace("NOV + '", "'Nov 15 - 14_43/")
shots = [dict(id=m[0], place=m[1], title=m[2], art=m[3]) for m in re.findall(r"\{ id: '([^']+)', place: '([^']+)', title: '([^']+)', art: '([^']+)'", src)]
names = {m[0]: (m[1], m[2]) for m in re.findall(r"\{ id: '([^']+)', name: '([^']+)', region: '([^']+)'", open(os.path.join(ROOT, "games/rift-realm/src/world/layout.ts"), encoding="utf-8").read())}

def art_image(s):
    a = s["art"]
    if a.startswith("video:"):
        import cv2
        c = cv2.VideoCapture(ART + a[6:]); c.set(cv2.CAP_PROP_POS_MSEC, VIDEO_T.get(s["id"], 2.0) * 1000); ok, f = c.read()
        if not ok: return None
        return Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    p = ART + a
    return Image.open(p).convert("RGB") if os.path.exists(p) else None

def font(n):
    for f in ("segoeuib.ttf", "arialbd.ttf", "arial.ttf"):
        try: return ImageFont.truetype(f, n)
        except OSError: pass
    return ImageFont.load_default()

os.makedirs(OUT, exist_ok=True)
F1, F2 = font(26), font(20)
H = 520
done = []
only = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None
for s in shots:
    if only and s["id"] not in only: continue
    g = next((GAME + s["id"] + e for e in (".jpg", ".png") if os.path.exists(GAME + s["id"] + e)), None)
    a = art_image(s)
    if not g or a is None:
        print("missing", s["id"], "game" if not g else "art"); continue
    gi = Image.open(g).convert("RGB")
    # crop the game frame to the art's aspect (centre), then both to the same height
    ar = a.width / a.height
    if gi.width / gi.height > ar: w = int(gi.height * ar); gi = gi.crop(((gi.width - w) // 2, 0, (gi.width - w) // 2 + w, gi.height))
    else: h = int(gi.width / ar); gi = gi.crop((0, (gi.height - h) // 2, gi.width, (gi.height - h) // 2 + h))
    a = a.resize((int(H * ar), H)); gi = gi.resize((int(H * ar), H))
    bar = 44
    out = Image.new("RGB", (a.width * 2 + 12, H + bar), (8, 10, 14))
    out.paste(a, (0, bar)); out.paste(gi, (a.width + 12, bar))
    d = ImageDraw.Draw(out)
    pname, region = names.get(s["place"], (s["place"], ""))
    d.text((12, 9), f"{pname} — {s['title']}", fill=(240, 236, 220), font=F1)
    d.text((a.width - 70, 13), "ART", fill=(160, 200, 255), font=F2)
    d.text((a.width * 2 + 12 - 150, 13), "IN GAME", fill=(120, 255, 200), font=F2)
    d.text((a.width + 24, 13), region, fill=(150, 160, 170), font=F2)
    out.save(os.path.join(OUT, s["id"] + ".jpg"), quality=80)
    done.append(s["id"]); print("pair", s["id"])

# contact sheet
pairs = [Image.open(os.path.join(OUT, i + ".jpg")) for i in done]
if pairs and not only:
    W = 900; rows = [p.resize((W, int(p.height * W / p.width))) for p in pairs]
    cols = 2; hh = max(r.height for r in rows)
    sheet = Image.new("RGB", (W * cols, hh * ((len(rows) + 1) // 2)), (8, 10, 14))
    for k, r in enumerate(rows): sheet.paste(r, ((k % cols) * W, (k // cols) * hh))
    sheet.save(os.path.join(OUT, "index.jpg"), quality=72)
print(len(done), "pairs")

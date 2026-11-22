"""Rift Realm — Elderwood Wilds: geometry score of a place against its art shot.

Both images (the art and the game frame from the same camera) go through the same monocular depth model
(Depth Anything V2, local, D:/Plajah Runtime/tela-py). The game's relative depth is aligned to the art's (scale + shift
on inverse depth, least squares), then scored:
  depth  = share of pixels whose aligned inverse depth is within 10 % of the art's (the layout: what is near, what is far)
  edges  = F-score of depth discontinuities (silhouettes: arches, pillars, trunks, deck edges), 3 px tolerance
  score  = 0.6 depth + 0.4 edges
and a diagnostic image is written: art | game | art depth | game depth | error (red = game too near, blue = too far).

  "D:/Plajah Runtime/tela-py/Scripts/python.exe" scripts/riftrealm/wilds_depth.py portal-plaza [more ids…]
"""
import os, re, sys, json
os.environ.setdefault("HF_HOME", "D:/Plajah Runtime/cache/hf")
import numpy as np, torch
from PIL import Image, ImageDraw
from transformers import pipeline

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("pairs_src", os.path.join(os.path.dirname(os.path.abspath(__file__)), "wilds_pairs.py"))

GAME = "D:/rr_work/wilds/game/"
OUT = "D:/rr_work/wilds/depth/"
W, H = 768, 432
os.makedirs(OUT, exist_ok=True)

def shot_art(sid):
    # reuse wilds_pairs.py's shot table and art loader (video frames included) without running its main
    src = open(spec.origin, encoding="utf-8").read().split("os.makedirs(OUT, exist_ok=True)")[0]
    g = {"__file__": spec.origin}; exec(src, g)
    s = next(s for s in g["shots"] if s["id"] == sid)
    return g["art_image"](s)

def fit(im, ar):
    if im.width / im.height > ar: w = int(im.height * ar); im = im.crop(((im.width - w) // 2, 0, (im.width - w) // 2 + w, im.height))
    else: h = int(im.width / ar); im = im.crop((0, (im.height - h) // 2, im.width, (im.height - h) // 2 + h))
    return im

_pipe = None
def depth(im):
    global _pipe
    if _pipe is None:
        _pipe = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Base-hf", device=0 if torch.cuda.is_available() else -1)
    d = np.asarray(_pipe(im)["predicted_depth"].squeeze().float().cpu().numpy(), dtype=np.float32)   # relative inverse depth (big = near)
    return np.asarray(Image.fromarray(d).resize((W, H), Image.BILINEAR))

def edges(d):
    gx = np.abs(np.diff(d, axis=1, append=d[:, -1:])); gy = np.abs(np.diff(d, axis=0, append=d[-1:, :]))
    g = np.hypot(gx, gy) / (np.abs(d) + 1e-3)
    return g > np.percentile(g, 92)

def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out

def score(sid):
    art = shot_art(sid).convert("RGB")
    gp = next((GAME + sid + e for e in (".png", ".jpg") if os.path.exists(GAME + sid + e)), None)
    game = Image.open(gp).convert("RGB")
    ar = art.width / art.height
    art, game = fit(art, ar).resize((W, H)), fit(game, ar).resize((W, H))
    da, dg = depth(art), depth(game)
    da = (da - da.min()) / (np.ptp(da) + 1e-6); dg = (dg - dg.min()) / (np.ptp(dg) + 1e-6)
    A = np.stack([dg.ravel(), np.ones(dg.size)], 1); s, t = np.linalg.lstsq(A, da.ravel(), rcond=None)[0]
    dga = dg * s + t
    err = dga - da
    # sky: where the game frame has no geometry (its farthest few percent) the art's haze is not compared
    sky = dg < 0.02
    depth_ok = float(np.mean((np.abs(err) < 0.10)[~sky])) if (~sky).any() else 0.0
    ea, eg = edges(da), edges(dga)
    prec = float((eg & dilate(ea, 3)).sum() / max(1, eg.sum())); rec = float((ea & dilate(eg, 3)).sum() / max(1, ea.sum()))
    f = 2 * prec * rec / max(1e-6, prec + rec)
    total = 0.6 * depth_ok + 0.4 * f
    # diagnostic
    def gray(d): return Image.fromarray((np.clip(d, 0, 1) * 255).astype(np.uint8)).convert("RGB")
    e = np.clip(err / 0.3, -1, 1); rgb = np.zeros((H, W, 3), np.uint8)
    rgb[..., 0] = (np.clip(e, 0, 1) * 255).astype(np.uint8); rgb[..., 2] = (np.clip(-e, 0, 1) * 255).astype(np.uint8); rgb[..., 1] = ((1 - np.abs(e)) * 60).astype(np.uint8)
    sheet = Image.new("RGB", (W * 3, H * 2 + 40), (10, 10, 14))
    for k, im in enumerate([art, game, Image.fromarray(rgb), gray(da), gray(dga), Image.fromarray(np.stack([ea * 255, eg * 255, ea * 0], -1).astype(np.uint8))]):
        sheet.paste(im, ((k % 3) * W, 40 + (k // 3) * H))
    ImageDraw.Draw(sheet).text((10, 10), f"{sid}  score {total:.3f}  (depth {depth_ok:.3f}, edges F {f:.3f})   art | game | error (red: game too near, blue: too far) / art depth | game depth | edges (red art, green game)", fill=(240, 240, 240))
    sheet.save(OUT + sid + ".jpg", quality=82)
    return {"id": sid, "score": round(total, 3), "depth": round(depth_ok, 3), "edgesF": round(f, 3)}

if __name__ == "__main__":
    res = [score(s) for s in sys.argv[1:]]
    print(json.dumps(res))
    log = OUT + "scores.jsonl"
    with open(log, "a", encoding="utf-8") as fh:
        for r in res: fh.write(json.dumps(r) + "\n")

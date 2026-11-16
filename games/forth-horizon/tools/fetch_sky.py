"""
Download the Magnific 4x upscales of the sky panoramas (5504x3072 PNG), shrink to 4096 wide, and write public/games/forth-horizon/tex/sky2_*.jpg.
The raw downloads go to a scratch folder, not the repo. Run: python tools/fetch_sky.py <scratch_dir>
"""
import os, sys, urllib.request
import cv2
import numpy as np

SCRATCH = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "forth-horizon", "tex")
SRC = {
    "sky2_clear": "https://pikaso.cdnpk.net/private/production/6050749172/enhanced-raw.png?token=exp=1795219200~hmac=17a3b92c6c9b890b271545660683acd5f7264a6dcd2eb550d21e5b88c3c4ae9e",
    "sky2_golden": "https://pikaso.cdnpk.net/private/production/6050749366/enhanced-raw.png?token=exp=1795219200~hmac=6ff396109218996cb02c740fe3e74f67266e6650f04c41354abc863a77b6e101",
    "sky2_sunset": "https://pikaso.cdnpk.net/private/production/6050750608/enhanced-raw.png?token=exp=1795219200~hmac=3265126c9d525178a5ca629749fe80aa0f0a3712f62ab5383e197c46b9110605",
    "sky2_dusk": "https://pikaso.cdnpk.net/private/production/6050750787/enhanced-raw.png?token=exp=1795219200~hmac=acf8bb1e58232367a25a6eebbea7ab67302404bbd5a7410cb4e2c973f43f1644",
    "sky2_night": "https://pikaso.cdnpk.net/private/production/6050751231/enhanced-raw.png?token=exp=1795219200~hmac=37cd94d7c4c2d03384a8f397c742e59145421a073615a69872a5e59e4744fbb6",
    "sky2_sunrise": "https://pikaso.cdnpk.net/private/production/6050751581/enhanced-raw.png?token=exp=1795219200~hmac=11bdbfc5ea7ecfd92631f75c5443c9f1d2e4d4fd68b1c2075451572fe132216e",
    "sky2_overcast": "https://pikaso.cdnpk.net/private/production/6050751232/enhanced-raw.png?token=exp=1795219200~hmac=ac7f5ca3a7bb33105d8652394a300876693ca8ae8d635deff787162f7d16f6ba",
    "sky2_storm": "https://pikaso.cdnpk.net/private/production/6050752652/enhanced-raw.png?token=exp=1795219200~hmac=ac2e30370d5c442fac20d1b830a6a65737d4a8d301a8bdbd237c77977db42a7b",
}
os.makedirs(SCRATCH, exist_ok=True)
for name, url in SRC.items():
    raw = os.path.join(SCRATCH, name + ".png")
    if not os.path.exists(raw):
        urllib.request.urlretrieve(url, raw)
    img = cv2.imread(raw)
    if img is None:
        print("failed", name); continue
    h, w = img.shape[:2]
    W = 4096
    out = cv2.resize(img, (W, round(h * W / w)), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(OUT, name + ".jpg"), out, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(name, (w, h), "->", out.shape[1::-1], os.path.getsize(os.path.join(OUT, name + ".jpg")) // 1024, "KB")

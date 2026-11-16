"""Sovereign GT-R: pull eight turntable frames and cut the car out (CPU only). Run with the Tela 3D env python."""
import glob, os, sys
import cv2
import numpy as np
from PIL import Image
os.environ.setdefault("U2NET_HOME", r"D:\Plajah Models\u2net")
os.environ.setdefault("ORT_LOGGING_LEVEL", "3")
from rembg import remove, new_session

SRC = "D:/plajah game assets deign from promtps/racer/Nov 15 - 14_22"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "views")
v = glob.glob(os.path.join(SRC, "Kestrel_Sovereign_GT-R_turntable*.mp4"))[0]
cap = cv2.VideoCapture(v)
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
sess = new_session("u2net", providers=["CPUExecutionProvider"])
for k in range(8):
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(n * k / 8))
    ok, im = cap.read()
    if not ok:
        continue
    rgb = Image.fromarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))
    rgb.save(os.path.join(OUT, f"frame{k}.png"))
    cut = remove(rgb, session=sess)
    cut.save(os.path.join(OUT, f"cut{k}.png"))
    a = np.array(cut)[..., 3]
    ys, xs = np.nonzero(a > 128)
    print(k, "bbox", xs.min(), ys.min(), xs.max(), ys.max())

"""Build a 3-view (front / side / back) finished QA gallery + print fidelity scores for any batch."""
import glob
import json
import os
import sys
import cv2
import numpy as np
from PIL import Image


def build(work_dir: str, out_png: str, ids: list[str]):
    cell = 260
    rows = []
    for cid in ids:
        jf = glob.glob(os.path.join(work_dir, cid, "score", "*.json"))
        ov_str = ""
        if jf:
            sc = json.load(open(jf[0], "r", encoding="utf-8"))
            ov = sc.get("overall", 0) * 100
            f = sc.get("front", {}).get("score", 0) * 100
            s = sc.get("side", {}).get("score", 0) * 100
            b = sc.get("back", {}).get("score", 0) * 100
            print(f"{cid:20s}  front={f:5.1f}%  side={s:5.1f}%  back={b:5.1f}%  overall={ov:5.1f}%")
            ov_str = f" ({ov:.0f}%)"
        else:
            print(f"{cid:20s}  (no score json)")
        tiles = []
        for vn in ("front", "side", "back"):
            p = os.path.join(work_dir, cid, "render_all", f"{vn}.png")
            tile = np.full((cell, cell, 3), (24, 28, 38), dtype=np.uint8)
            if os.path.isfile(p):
                im = np.array(Image.open(p).convert("RGBA"))
                rs = cv2.resize(im, (cell - 16, cell - 28), interpolation=cv2.INTER_AREA)
                al = rs[:, :, 3:4].astype(np.float32) / 255.0
                tile[24 : 24 + rs.shape[0], 8 : 8 + rs.shape[1]] = (
                    rs[:, :, :3].astype(np.float32) * al + tile[24 : 24 + rs.shape[0], 8 : 8 + rs.shape[1]].astype(np.float32) * (1 - al)
                ).astype(np.uint8)
            lbl = f"{cid}: {vn}{ov_str if vn == 'front' else ''}"
            cv2.putText(tile, lbl, (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (240, 244, 255), 1, cv2.LINE_AA)
            tiles.append(tile)
        rows.append(np.hstack(tiles))
    Image.fromarray(np.vstack(rows)).save(out_png)
    print("Gallery written:", out_png)


if __name__ == "__main__":
    work_dir = sys.argv[1]
    out_png = sys.argv[2]
    ids = sys.argv[3:]
    build(work_dir, out_png, ids)

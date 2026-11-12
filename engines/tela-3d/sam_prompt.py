"""
sam_prompt.py: SAM 2.1 masks from prompts (points in, points out, a box), many per picture, in one call.

  python sam_prompt.py jobs.json

jobs.json: {"image": "view.png", "results": "results.json", "jobs": [{"name": "sode#0", "pos": [[x, y], ...],
"neg": [[x, y], ...], "box": [x0, y0, x1, y1], "guide": "guide.png", "out": "sode_0.png"}, ...]}

Each job is tried several ways (box with points, points alone, box alone), three masks each. The mask kept is the one
that best fits the job's guide (the model's own render of that piece, grown a few pixels so a near miss still counts),
weighted by SAM's confidence. results.json records, per job, the kept mask's guide IoU and SAM score, so a cut that
went wrong can be told from a model that is wrong.
"""
import json
import os
import sys

import numpy as np
import torch
import cv2
from PIL import Image

MODELS_ROOT = os.environ.get("PLAJAH_MODELS_ROOT", r"D:\Plajah Models")
SRC_ROOT = os.environ.get("TELA3D_SRC", r"D:\Plajah Runtime\tela3d-src")
sys.path.insert(0, os.path.join(SRC_ROOT, "sam2"))
from sam2.build_sam import build_sam2  # noqa: E402
from sam2.sam2_image_predictor import SAM2ImagePredictor  # noqa: E402

spec = json.load(open(sys.argv[1]))
device = "cuda" if torch.cuda.is_available() else "cpu"
model = build_sam2("configs/sam2.1/sam2.1_hiera_s.yaml", os.path.join(MODELS_ROOT, "sam2", "sam2.1_hiera_small.pt"), device=device)
pred = SAM2ImagePredictor(model)
img = np.array(Image.open(spec["image"]).convert("RGB"))
results = {}
with torch.inference_mode():
    pred.set_image(img)
    for job in spec["jobs"]:
        pos, neg, box = job.get("pos", []), job.get("neg", []), job.get("box")
        guide_img = Image.open(job["guide"]).convert("L") if job.get("guide") else None
        g = np.array(guide_img) > 127 if guide_img is not None else None
        g_grown = cv2.dilate(g.astype(np.uint8), np.ones((13, 13), np.uint8)) > 0 if g is not None else None
        variants = []
        if pos:
            pts = np.array(pos + neg, dtype=np.float32)
            labels = np.array([1] * len(pos) + [0] * len(neg), dtype=np.int32)
            variants.append(dict(point_coords=pts, point_labels=labels, box=np.array(box, dtype=np.float32) if box else None))
            variants.append(dict(point_coords=pts, point_labels=labels, box=None))
        if box:
            variants.append(dict(point_coords=None, point_labels=None, box=np.array(box, dtype=np.float32)))
        best, best_q, best_iou, best_score = None, -1.0, 0.0, 0.0
        for v in variants:
            masks, scores, _ = pred.predict(multimask_output=True, **v)
            for m, s in zip(masks, scores):
                m = m > 0
                if g is not None:
                    inter = (m & g_grown).sum()
                    # fit to the guide: what of the mask lies on the (grown) guide, against the union with the guide itself
                    iou = inter / max(1, (m | g).sum())
                    q = iou * float(s) ** 0.5
                else:
                    iou, q = 0.0, float(s)
                if q > best_q:
                    best, best_q, best_iou, best_score = m, q, float(iou), float(s)
        Image.fromarray((best * 255).astype(np.uint8)).save(job["out"])
        results[job["name"]] = {"guideIoU": round(best_iou, 3), "score": round(best_score, 3)}
        print(f"{job['name']}: guide IoU {best_iou:.2f}, score {best_score:.2f}", flush=True)
if spec.get("results"):
    json.dump(results, open(spec["results"], "w"), indent=1)

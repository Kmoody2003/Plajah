"""
sam_prompt.py: SAM 2.1 masks from prompts (points in, points out, a box), many per picture, in one call.

  python sam_prompt.py jobs.json

jobs.json: {"image": "view.png", "jobs": [{"name": "sode", "pos": [[x, y], ...], "neg": [[x, y], ...],
"box": [x0, y0, x1, y1], "guide": "guide.png", "out": "sode.png"}, ...]}

Each job writes a 0/255 mask PNG the size of the image. SAM offers three masks per prompt; the one kept is the one that
best overlaps the job's guide mask (the model's own render of that part, when given), else SAM's best score.
"""
import json
import os
import sys

import numpy as np
import torch
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
with torch.inference_mode():
    pred.set_image(img)
    for job in spec["jobs"]:
        pts = [p for p in job.get("pos", [])] + [p for p in job.get("neg", [])]
        labels = [1] * len(job.get("pos", [])) + [0] * len(job.get("neg", []))
        masks, scores, _ = pred.predict(
            point_coords=np.array(pts, dtype=np.float32) if pts else None,
            point_labels=np.array(labels, dtype=np.int32) if pts else None,
            box=np.array(job["box"], dtype=np.float32) if job.get("box") else None,
            multimask_output=True,
        )
        best = int(np.argmax(scores))
        if job.get("guide"):
            g = np.array(Image.open(job["guide"]).convert("L")) > 127
            ious = [((m > 0) & g).sum() / max(1, ((m > 0) | g).sum()) for m in masks]
            best = int(np.argmax(ious))
        Image.fromarray(((masks[best] > 0) * 255).astype(np.uint8)).save(job["out"])
        print(f"{job['name']}: score {scores[best]:.2f}", flush=True)

"""face_landmarks.py — MediaPipe's 478 face landmarks for a reference image, as JSON (docs/character-forge.md §4).

The Forge face is MediaPipe's canonical face, so landmarks found on a front portrait map the portrait onto the face
atlas triangle by triangle (scripts/eraclash3d/forgeLook.ts paintFaceFromArt).

    python -P engines/tela-3d/face_landmarks.py <image> <face_landmarker.task> <out.json>

Writes {"width", "height", "image", "points": [[x_px, y_px, z], ...]}; "image" is a true PNG copy of the input next
to the JSON (art tools often save JPEG or WebP under a .png name).
"""
import json
import sys

import mediapipe as mp
import numpy as np
from PIL import Image
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision


def main(image_path: str, model_path: str, out_path: str) -> None:
    options = vision.FaceLandmarkerOptions(base_options=mp_python.BaseOptions(model_asset_path=model_path), num_faces=1)
    with vision.FaceLandmarker.create_from_options(options) as landmarker:
        pil = Image.open(image_path).convert("RGB")
        rgb = np.ascontiguousarray(np.asarray(pil))
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect(image)
    if not result.face_landmarks:
        sys.exit(f"no face found in {image_path}")
    w, h = image.width, image.height
    pts = [[p.x * w, p.y * h, p.z * w] for p in result.face_landmarks[0]]
    png_path = out_path.rsplit(".", 1)[0] + ".rgb.png"
    pil.save(png_path, "PNG")
    with open(out_path, "w") as f:
        json.dump({"width": w, "height": h, "image": png_path, "points": pts}, f)
    print(f"{len(pts)} landmarks, {w}x{h} -> {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:4])

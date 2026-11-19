"""Cyber Forest moth antenna, cut straight from the moth sheet's back view (saturated feather pixels only).
The moth wings and bat membrane are painted in code (creatures.ts): every view of the moth has the antennae
over the wings, and the bat sheets only show folded membrane.
python exportFliers.py <moth-sheet.jpg> <out-dir>"""
import sys, cv2, numpy as np
moth = cv2.imdecode(np.fromfile(sys.argv[1], np.uint8), 1); out = sys.argv[2]
crop = moth[120:335, 990:1110].astype(np.float32)  # the left feather of the back view
bg = np.median(np.concatenate([crop[:8, :8].reshape(-1, 3), crop[:8, -8:].reshape(-1, 3)]), 0)
d = np.linalg.norm(crop - bg, axis=2)
sat = cv2.cvtColor(crop.astype(np.uint8), cv2.COLOR_BGR2HSV)[..., 1] / 255.
a = np.clip((d - 10) / 40, 0, 1) * np.clip((sat - 0.12) / 0.15, 0, 1)
cv2.imwrite(out + '/moth_antenna.webp', np.dstack([crop, a * 255]).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])
print('antenna', crop.shape, (a > 0.5).mean())

"""
Asphalt micro maps for the road shader. Source: the racer folder's damp-asphalt reference sheet, whose height panel was upscaled 4x with Magnific.
From that height map this derives a normal map and an ambient-occlusion map, and a roughness map from the sheet's roughness panel plus the height detail; every map
is made seamless so it tiles. Output (1024 px, jpg) goes to public/games/forth-horizon/tex/: road_n.jpg, road_r.jpg, road_ao.jpg.
Usage: python tools/build_road_pbr.py <height_upscaled.png> <rough_panel.png>
"""
import os, sys
import cv2
import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "public", "games", "forth-horizon", "tex")
N = 1024


def seamless(a):
    h, w = a.shape[:2]
    x = np.linspace(0, 1, w, dtype=np.float32); y = np.linspace(0, 1, h, dtype=np.float32)
    tri = lambda t: np.clip(1 - np.abs(2 * t - 1), 0, 1)
    m = np.outer(tri(y), tri(x)); m = np.clip((m - 0.0) * 1.6, 0, 1); m = m * m * (3 - 2 * m)
    b = np.roll(a, (h // 2, w // 2), (0, 1))
    if a.ndim == 3: m = m[..., None]
    return a * m + b * (1 - m)


def prep(path):
    im = cv2.imread(path, cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255.0
    return seamless(cv2.resize(im, (N, N), interpolation=cv2.INTER_AREA))


H = prep(sys.argv[1])
H = (H - H.mean()) / (H.std() + 1e-5)                       # unit contrast so the normal strength is the same whatever the source
Hs = cv2.GaussianBlur(H, (0, 0), 0.8)
gx = cv2.Sobel(Hs, cv2.CV_32F, 1, 0, ksize=3) / 8.0
gy = cv2.Sobel(Hs, cv2.CV_32F, 0, 1, ksize=3) / 8.0
S = 1.1
nx, ny, nz = -gx * S, -gy * S, np.ones_like(gx)
l = np.sqrt(nx * nx + ny * ny + nz * nz)
nrm = np.stack([nz / l * 0 + (nx / l * 0.5 + 0.5), (ny / l * 0.5 + 0.5), (nz / l * 0.5 + 0.5)], -1)
cv2.imwrite(os.path.join(OUT, "road_n.jpg"), cv2.cvtColor((np.clip(nrm, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 94])

# ambient occlusion: pits and the gaps between stones are darker than the average of their neighbourhood
cav = cv2.GaussianBlur(H, (0, 0), 7) - cv2.GaussianBlur(H, (0, 0), 1.2)
ao = np.clip(0.78 + cav * 0.22 + H * 0.06, 0.25, 1.0)
cv2.imwrite(os.path.join(OUT, "road_ao.jpg"), (ao * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 94])

# roughness: the sheet's roughness panel (damp and oily patches) with the stone detail on top, tops of stones a little smoother
R = prep(sys.argv[2]) if len(sys.argv) > 2 else np.full((N, N), 0.6, np.float32)
R = cv2.GaussianBlur(R, (0, 0), 3)
r = np.clip(R * 0.75 + (0.5 - np.clip(H * 0.12, -0.4, 0.4)) * 0.4, 0, 1)
cv2.imwrite(os.path.join(OUT, "road_r.jpg"), (r * 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 94])
print("wrote road_n/road_r/road_ao", N, "px; normal mean", nrm.reshape(-1, 3).mean(0))

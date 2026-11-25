"""Automated 8-Angle 3D Turntable vs. Reference Video-Turntable QA Comparator.

Compares rendered 8-angle turntables (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°) of our finished 3D GLBs
against reference rotation `.mp4` videos (e.g. Grovewardens turntables), auto-aligns yaw phase, computes
per-angle silhouette IoU, and renders red/blue irregularity delta sheets:
  - GREEN = silhouette match
  - RED   = in video, missing from 3D
  - BLUE  = in 3D, extra blob/web not in video

Usage:
  python scripts/riftrealm/colab/turntable_video_qa.py <glb> <video_mp4> <out_png>
"""
import os
import subprocess
import sys
import tempfile
import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

RENDER_TURNTABLE_MJS = os.path.join(HERE, "render_turntable8.mjs")


def ensure_renderer_mjs():
    if os.path.isfile(RENDER_TURNTABLE_MJS):
        return
    code = r"""
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const [glbPath, outDir] = process.argv.slice(2);
if (!glbPath || !outDir) { console.error('usage: node render_turntable8.mjs <glb> <outDir>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../..');
const glbBuf = fs.readFileSync(glbPath);

const srv = http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  if (u === '/model.glb') { res.writeHead(200, { 'Content-Type': 'model/gltf-binary' }); res.end(glbBuf); return; }
  if (u === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html><body style="margin:0;background:transparent"><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setSize(512, 512);
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = 1.1;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(r);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.9));
const dl = new THREE.DirectionalLight(0xfff5e8, 1.9); dl.position.set(3, 5, 4); scene.add(dl);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 50);
const gltf = await new GLTFLoader().loadAsync('/model.glb');
const root = gltf.scene;
const box = new THREE.Box3().setFromObject(root);
const sz = box.getSize(new THREE.Vector3());
const sc = 1.72 / Math.max(sz.x, sz.y, sz.z, 0.01);
root.scale.setScalar(sc);
box.setFromObject(root);
const c = box.getCenter(new THREE.Vector3());
root.position.set(-c.x, -c.y, -c.z);
scene.add(root);
window.renderAngle = (deg) => {
  const rad = deg * Math.PI / 180;
  cam.position.set(Math.sin(rad) * 4, 0, Math.cos(rad) * 4);
  cam.lookAt(0, 0, 0);
  r.render(scene, cam);
  return r.domElement.toDataURL('image/png');
};
window.__READY = true;
</script></body></html>`);
    return;
  }
  const fp = path.join(ROOT, u.replace(/^\//, ''));
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
    const ext = path.extname(fp);
    const mime = ext === '.js' ? 'application/javascript' : ext === '.wasm' ? 'application/wasm' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(fp));
    return;
  }
  res.writeHead(404); res.end();
});

await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const port = srv.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.__READY === true, { timeout: 60000 });
for (let i = 0; i < 8; i++) {
  const deg = i * 45;
  const dataUrl = await page.evaluate((d) => window.renderAngle(d), deg);
  fs.writeFileSync(path.join(outDir, `ang_${String(deg).padStart(3, '0')}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
await browser.close();
srv.close();
"""
    with open(RENDER_TURNTABLE_MJS, "w", encoding="utf-8") as f:
        f.write(code.strip() + "\n")


def extract_video_silhouettes(mp4_path: str, n_samples: int = 36):
    cap = cv2.VideoCapture(mp4_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total < 8:
        raise RuntimeError(f"Video too short: {mp4_path} ({total} frames)")
    frames = []
    for idx in np.linspace(0, total - 1, n_samples, dtype=int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, bgr = cap.read()
        if not ok:
            continue
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        h, w = rgb.shape[:2]
        # Per-row studio gradient backdrop from left/right margin strips (handles vertical studio wall/floor gradients!)
        m_w = max(12, w // 14)
        borders = np.concatenate([rgb[:, :m_w, :], rgb[:, -m_w:, :]], axis=1)
        bg_row = np.median(borders, axis=1, keepdims=True)  # (h, 1, 3)
        diff = np.linalg.norm(rgb.astype(np.float32) - bg_row.astype(np.float32), axis=2)
        # Also remove low-saturation studio floor shadows near margins
        mask = (diff > 24).astype(np.uint8)
        # Clear far left/right 4% margins and morphological open to drop stray specs
        mask[:, : max(4, w // 25)] = 0
        mask[:, -max(4, w // 25) :] = 0
        kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kern)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kern)
        # Keep largest connected component
        nl, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
        if nl > 1:
            best = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
            mask = (lab == best).astype(np.uint8)
            # Trim thin round black turntable platter disc at the very bottom if wider than ankles
            ys, xs = np.nonzero(mask > 0)
            if len(ys) > 100:
                y0, y1 = int(ys.min()), int(ys.max())
                mh = max(1, y1 - y0)
                # Look at bottom 9% rows: if width suddenly balloons >1.35x ankle width (at 85%-90% height), crop disc
                ankle_w = np.median([mask[r].sum() for r in range(y0 + int(mh * 0.80), y0 + int(mh * 0.90)) if mask[r].sum() > 0] or [0])
                if ankle_w > 0:
                    cut_y = y1 + 1
                    for r in range(y0 + int(mh * 0.88), y1 + 1):
                        if mask[r].sum() > ankle_w * 1.38:
                            cut_y = r
                            break
                    if cut_y <= y1:
                        mask[cut_y:, :] = 0
        frames.append((rgb, mask))
    cap.release()
    return frames


def norm_crop(rgb: np.ndarray, mask: np.ndarray, size: int = 256):
    ys, xs = np.nonzero(mask > 0)
    if len(xs) < 20:
        return np.zeros((size, size, 3), np.uint8), np.zeros((size, size), np.uint8)
    y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
    cr_rgb = rgb[y0:y1, x0:x1]
    cr_m = mask[y0:y1, x0:x1]
    h, w = cr_m.shape
    sc = (size * 0.86) / max(h, w)
    nw, nh = max(1, int(w * sc)), max(1, int(h * sc))
    r_rgb = cv2.resize(cr_rgb, (nw, nh), interpolation=cv2.INTER_AREA)
    r_m = (cv2.resize(cr_m, (nw, nh), interpolation=cv2.INTER_AREA) > 0).astype(np.uint8)
    out_rgb = np.full((size, size, 3), (24, 28, 36), np.uint8)
    out_m = np.zeros((size, size), np.uint8)
    ox, oy = (size - nw) // 2, (size - nh) // 2
    out_rgb[oy : oy + nh, ox : ox + nw] = np.where(r_m[..., None] > 0, r_rgb, out_rgb[oy : oy + nh, ox : ox + nw])
    out_m[oy : oy + nh, ox : ox + nw] = r_m
    return out_rgb, out_m


def compare_turntable(glb_path: str, mp4_path: str, out_png: str):
    ensure_renderer_mjs()
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(["node", RENDER_TURNTABLE_MJS, glb_path, td], check=True, cwd=ROOT)
        ren = []
        for i in range(8):
            im = np.array(Image.open(os.path.join(td, f"ang_{i*45:03d}.png")).convert("RGBA"))
            ren.append(norm_crop(im[:, :, :3], (im[:, :, 3] > 120).astype(np.uint8), 220))

    vframes = extract_video_silhouettes(mp4_path, n_samples=36)
    vnorm = [norm_crop(r, m, 220) for r, m in vframes]

    # Auto-align video phase, direction (+1 / -1), and angular span (0.85..1.25 turns) to maximize 8-angle silhouette IoU
    best_score = -1.0
    best_match = None
    nv = len(vnorm)
    for direction in (1, -1):
        for span in (0.85, 1.0, 1.15, 1.35):
            for offset in range(nv):
                ious = []
                picks = []
                for k in range(8):
                    vi = int(round(offset + direction * k * (nv / span) / 8.0)) % nv
                    m_r = ren[k][1] > 0
                    m_v = vnorm[vi][1] > 0
                    iou = float((m_r & m_v).sum()) / max(1, int((m_r | m_v).sum()))
                    ious.append(iou)
                    picks.append(vi)
                mean_iou = float(np.mean(ious))
                if mean_iou > best_score:
                    best_score = mean_iou
                    best_match = (picks, ious)

    picks, ious = best_match
    row_v, row_r, row_d = [], [], []
    for k in range(8):
        vr, vm = vnorm[picks[k]]
        rr, rm = ren[k]
        # Delta visualization: green=overlap, red=video-only (missing), blue=3D-only (extra web/blob)
        delta = np.full((220, 220, 3), (18, 22, 30), np.uint8)
        both = (vm > 0) & (rm > 0)
        miss = (vm > 0) & (rm == 0)
        extra = (vm == 0) & (rm > 0)
        delta[both] = (46, 204, 113)
        delta[miss] = (231, 76, 60)
        delta[extra] = (56, 189, 248)
        cv2.putText(delta, f"{k*45}d IoU:{ious[k]*100:.0f}%", (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
        row_v.append(vr)
        row_r.append(rr)
        row_d.append(delta)

    grid = np.vstack([np.hstack(row_v), np.hstack(row_r), np.hstack(row_d)])
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    Image.fromarray(grid).save(out_png)
    print(f"[QA-TURNTABLE] {os.path.basename(glb_path):24s} vs {os.path.basename(mp4_path)[:36]} -> 8-angle mean IoU = {best_score*100:.1f}% (min={min(ious)*100:.1f}%) | {out_png}", flush=True)
    return best_score, ious


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("usage: python turntable_video_qa.py <glb> <video_mp4> <out_png>")
        sys.exit(1)
    compare_turntable(sys.argv[1], sys.argv[2], sys.argv[3])

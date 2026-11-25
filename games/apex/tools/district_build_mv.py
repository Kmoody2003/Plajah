"""
District assets, quality pass: Kenne's sheet views -> one multi-view shape -> painted from the drawings -> scored against the sheet.
(The first pass, scripts/apex-build-district-assets.mjs, gave a single-view Hunyuan3D-2mini shape pressed into the side view on a voxel grid:
soft, terraced, the opera hall a blob. This replaces it for the district pieces.)

Per asset (tools/data/district_assets.json; its sheet from tools/district_sheets.py, front | side at x3):
 1. Views: the sheet split at its widest background gap, taken back to the drawing's own pixels and upscaled x4 with Real-ESRGAN x4plus
    (D:/Plajah Models/upscale), cut out (u2net).
 2. Shape: Hunyuan3D-2mv (D:/Plajah Models/hf/hy3dgen/tencent/Hunyuan3D-2mv, full model, 30 steps, octree 380) from front + side together.
    No mirrored back: it made the model build the tower twice. The sheet doesn't say which side its side elevation is, so it is tried as
    'right'; if the finished shape's outline fits the drawing better from the left, it is generated again as 'left'.
 3. Turn: the quarter turn (and mirror) whose front and side outlines best overlap the drawings, like the cars' multi-view match.
 4. Paint: engines/tela-3d/paint_from_views.py from the upscaled front and side, 2048 atlas.
 5. Score: each view's outline overlap after paint (report.json); the game copy is made by tools/district_game_glb.py.

  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" games/apex/tools/district_build_mv.py [id ...]
Works on D (C is near full): D:/plajah-tmp/district/<id>/{front.png,side.png,shape.glb,painted.glb,report.json}; report.json and the two
views are copied to games/apex/assets-src/district/<id>/mv/ for the record. tools/district_game_glb.py takes painted.glb from D.
"""
import json, os, shutil, subprocess, sys, time

import numpy as np
import torch
import trimesh
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC = os.path.join(HERE, "..", "assets-src", "district")
ENGINE = os.path.join(ROOT, "engines", "tela-3d")
sys.path.insert(0, r"D:\Plajah Runtime\tela3d-src\Hunyuan3D-2")
sys.path.insert(0, ENGINE)
sys.path.append(r"D:\ComfyUI_windows_portable\ComfyUI_windows_portable\python_embeded\Lib\site-packages")   # last: spandrel only
from paint_from_views import decimate, fit_view, view_axes  # noqa: E402

WORK = r"D:\plajah-tmp\district"
MV = r"D:\Plajah Models\hf\hy3dgen\tencent\Hunyuan3D-2mv"
ESRGAN = r"D:\Plajah Models\upscale\RealESRGAN_x4plus.pth"


def split_sheet(path):
    im = np.array(Image.open(path).convert("RGB")).astype(int)
    bg = np.median(np.concatenate([im[:8].reshape(-1, 3), im[-8:].reshape(-1, 3)]), axis=0)
    ink = (np.abs(im - bg).max(axis=2) > 26).any(axis=0)
    xs = np.nonzero(ink)[0]
    k = int(np.argmax(np.diff(xs)))
    cut = (xs[k] + xs[k + 1]) // 2
    return Image.fromarray(im[:, :cut].astype(np.uint8)), Image.fromarray(im[:, cut:].astype(np.uint8))


_up = {}
def upscale(img):
    import spandrel
    if "m" not in _up:
        _up["m"] = spandrel.ModelLoader().load_from_file(ESRGAN).cuda().eval().half()
    small = img.resize((max(1, img.width // 3), max(1, img.height // 3)), Image.LANCZOS)   # the sheet is x3 bicubic: back to the drawing's pixels
    x = torch.from_numpy(np.array(small)).permute(2, 0, 1)[None].float().div(255).cuda().half()
    with torch.no_grad():
        y = _up["m"](x)
    return Image.fromarray((y[0].float().clamp(0, 1).permute(1, 2, 0).cpu().numpy() * 255).astype(np.uint8))


_cut = {}
def cutout(img):
    import cv2, rembg
    if "s" not in _cut:
        os.environ.setdefault("U2NET_HOME", r"D:\Plajah Models\u2net")
        _cut["s"] = rembg.new_session("u2net", providers=["CPUExecutionProvider"])
    a = np.array(rembg.remove(img, session=_cut["s"]).convert("RGBA"))
    m = (a[:, :, 3] > 40).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:                                                                      # the building, not a stray caption or tree
        keep = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
        small = [i for i in range(1, n) if i != keep and st[i, cv2.CC_STAT_AREA] < 0.02 * st[keep, cv2.CC_STAT_AREA]]
        for i in small:
            a[lab == i, 3] = 0
    return Image.fromarray(a)


_pipe = {}
def generate(views, seed=7):
    from hy3dgen.shapegen import DegenerateFaceRemover, FloaterRemover, Hunyuan3DDiTFlowMatchingPipeline
    if "p" not in _pipe:
        _pipe["p"] = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(MV, subfolder="hunyuan3d-dit-v2-mv", variant="fp16", device="cuda")
    with torch.no_grad():
        mesh = _pipe["p"](image=views, num_inference_steps=30, octree_resolution=380, num_chunks=20000,
                          generator=torch.manual_seed(seed), output_type="trimesh")[0]
    mesh = DegenerateFaceRemover()(FloaterRemover()(mesh))
    parts = mesh.split(only_watertight=False)
    if len(parts) > 1:                                                             # the main piece (and anything within 3% of its area)
        parts = sorted(parts, key=lambda q: q.area, reverse=True)
        mesh = trimesh.util.concatenate([q for q in parts if q.area > 0.03 * parts[0].area])
    return decimate(mesh, 250000)


def overlap(mesh, name, alpha):
    pts = trimesh.sample.sample_surface(mesh, 30_000)[0]           # enough for an outline, and the turn search runs it 24 times
    d, right, up = view_axes(name)
    return float(fit_view(pts, d, right, alpha, up)[1])


def best_turn(mesh, front_a, side_a):
    """the quarter turn (and mirror) that makes the front and side outlines match the drawings; returns (mesh, side name, scores)"""
    best = None
    for mirror in (False, True):
        for k in range(4):
            m = mesh.copy()
            if mirror:
                m.apply_transform(np.diag([-1, 1, 1, 1])); m.invert()
            m.apply_transform(trimesh.transformations.rotation_matrix(k * np.pi / 2, [0, 1, 0]))
            f = overlap(m, "front", front_a)
            for side in ("left", "right"):
                s = overlap(m, side, side_a)
                score = f + s
                if not best or score > best[0]:
                    best = (score, m, side, {"front": round(f, 3), side: round(s, 3), "turn": k * 90, "mirror": mirror})
    return best[1], best[2], best[3]


def build(a):
    d = os.path.join(WORK, a["id"])
    os.makedirs(d, exist_ok=True)
    t0 = time.time()
    f_img, s_img = split_sheet(os.path.join(SRC, a["id"], "sheet.png"))
    front, side = cutout(upscale(f_img)), cutout(upscale(s_img))
    fp, sp = os.path.join(d, "front.png"), os.path.join(d, "side.png")
    front.save(fp); side.save(sp)
    fa, sa = np.array(front)[:, :, 3], np.array(side)[:, :, 3]
    report = {"id": a["id"], "views": {"front": front.size, "side": side.size}, "tries": []}
    mesh, side_name, sc = None, None, None
    for as_side in ("right", "left"):
        m = generate({"front": front, as_side: side})
        m, sname, s = best_turn(m, fa, sa)
        s["generatedAs"] = as_side
        report["tries"].append(s)
        print(f"[{a['id']}] side as {as_side}: {s}", flush=True)
        if sc is None or (s["front"] + s[sname]) > (sc["front"] + sc[side_name]) + 0.01:
            mesh, side_name, sc = m, sname, s
        if s["front"] + s[sname] > 1.7:                                            # both outlines fit: no need for the other reading
            break
    mesh.apply_translation([-mesh.bounds[:, 0].mean(), -mesh.bounds[0, 1], -mesh.bounds[:, 2].mean()])
    shape = os.path.join(d, "shape.glb")
    mesh.export(shape)
    painted = os.path.join(d, "painted.glb")
    p = subprocess.run([sys.executable, "-W", "ignore", os.path.join(ENGINE, "paint_from_views.py"), "--mesh", shape, "--out", painted,
                        "--faces", str(a.get("faces", 90000)), "--res", "2048", "--view", f"front={fp}", "--view", f"{side_name}={sp}"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode:
        raise RuntimeError(p.stderr[-1200:])
    report["paint"] = [l for l in p.stdout.splitlines() if "overlap" in l.lower() or "iou" in l.lower()][-4:]
    report["chosen"] = sc
    report["sideAs"] = side_name
    report["seconds"] = round(time.time() - t0)
    json.dump(report, open(os.path.join(d, "report.json"), "w"), indent=1)
    keep = os.path.join(SRC, a["id"], "mv")
    os.makedirs(keep, exist_ok=True)
    for f in ("report.json", "front.png", "side.png"):
        shutil.copyfile(os.path.join(d, f), os.path.join(keep, f))
    print(f"[{a['id']}] done in {report['seconds']} s: {sc}", flush=True)


def main():
    man = json.load(open(os.path.join(HERE, "data", "district_assets.json"), encoding="utf8"))
    only = set(sys.argv[1:])
    for a in man["assets"]:
        if only and a["id"] not in only:
            continue
        try:
            build(a)
        except Exception as e:
            print(f"[{a['id']}] FAILED: {e}", flush=True)
        torch.cuda.empty_cache()


if __name__ == "__main__":
    main()

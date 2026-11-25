"""Local CPU finishing pipeline for Void Leviathan (Boss #31) + ALL 24 Cyber Forest Creatures (Batch 3A + 3B).

Outputs:
  1. public/games/rift-realm/assets/characters/void_leviathan.glb (+ KTX2 gpu/void_leviathan.glb)
  2. public/games/rift-realm/assets/creatures/rigged/<id>.glb (all 24 creatures, 30k tris, 1024/2048 PBR + emissive,
     JPEG-compressed ~2.5-4.0 MB matching existing Elderwood creature contract, geodesic rigs + 12-14 embedded clips)

Usage:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/riftrealm/colab/finish_batch3.py [id ...]
"""
import io
import os
import shutil
import subprocess
import sys
import numpy as np
import trimesh
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PY = sys.executable

B3A_SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch3a"
B3B_SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch3b"
WORK_ROOT = os.path.join(B3A_SCRATCH, "work_all")
CHAR_ASSETS = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")
CR_RIGGED = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "creatures", "rigged")

sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm", "creatures"))

# 25 total models: void_leviathan (characters/) + 24 Cyber Forest creatures (creatures/rigged/)
SPECS = {
    # --- Colossal Boss #31 (Batch 3A redo -> assets/characters/) ---
    "void_leviathan": dict(batch="3a", out="char", arch="serpent_boss", views=["front", "back_mirror"], hue=(16, 62), smin=0.34, vmin=0.40, gain=1.80, faces=56000, res=2048),

    # --- Core 6 Elderwood Multi-View Upgrades (Batch 3A -> assets/creatures/rigged/) ---
    "electric_wolf": dict(batch="3a", out="cr", arch="wolf", views=["front", "back", "left", "right"], hue=(178, 232), smin=0.32, vmin=0.42, gain=1.70, faces=28000, res=1024),
    "lumen_deer": dict(batch="3a", out="cr", arch="deer", views=["front", "back", "left", "right"], hue=(155, 215), smin=0.28, vmin=0.42, gain=1.65, faces=28000, res=1024),
    "venom_mantis": dict(batch="3a", out="cr", arch="mantis", views=["front", "back", "left", "right"], hue=(62, 138), smin=0.38, vmin=0.38, gain=1.75, faces=28000, res=1024),
    "plasma_wasp": dict(batch="3a", out="cr", arch="wasp", views=["front", "back", "left", "right"], hue=(165, 225), smin=0.32, vmin=0.38, gain=1.70, faces=28000, res=1024),
    "storm_bat": dict(batch="3a", out="cr", arch="bat", views=["front", "back", "left", "right"], hue=(175, 255), smin=0.30, vmin=0.40, gain=1.50, faces=30000, res=1024),
    "glow_moth": dict(batch="3a", out="cr", arch="moth", views=["front", "back", "left", "right"], hue=(170, 265), smin=0.28, vmin=0.42, gain=1.65, faces=24000, res=1024),

    # --- Flagship 6 Cyber Forest Apex & Fauna (Batch 3A) ---
    "apex_drake": dict(batch="3a", out="cr", arch="wolf", views=["front", "left", "right"], hue=(185, 248), smin=0.34, vmin=0.38, gain=1.75, faces=28000, res=1024),
    "amphibian_brute": dict(batch="3a", out="cr", arch="biped", views=["front", "back", "left", "right"], hue=(150, 205), smin=0.34, vmin=0.40, gain=1.60, faces=28000, res=1024),
    "shadow_stalker_beast": dict(batch="3a", out="cr", arch="wolf", views=["front", "back", "left", "right"], hue=(152, 208), smin=0.36, vmin=0.36, gain=1.75, faces=28000, res=1024),
    "bio_sloth": dict(batch="3a", out="cr", arch="biped", views=["front", "back", "left", "right"], hue=(110, 205), smin=0.34, vmin=0.42, gain=1.60, faces=28000, res=1024),
    "cryo_panther": dict(batch="3a", out="cr", arch="wolf", views=["front", "back", "left", "right"], hue=(178, 232), smin=0.28, vmin=0.44, gain=1.60, faces=28000, res=1024),
    "hydro_serpent": dict(batch="3a", out="cr", arch="serpent", views=["front", "back", "left", "right"], hue=(162, 215), smin=0.32, vmin=0.40, gain=1.65, faces=28000, res=1024),

    # --- Remaining 12 Cyber Forest Fauna (Batch 3B) ---
    "bio_axolotl": dict(batch="3b", out="cr", arch="wolf", views=["front", "back", "left", "right"], hue=(155, 215), smin=0.24, vmin=0.52, gain=1.55, faces=24000, res=1024),
    "cyan_bat": dict(batch="3b", out="cr", arch="bat", views=["front", "back", "left", "right"], hue=(162, 212), smin=0.34, vmin=0.40, gain=1.75, faces=28000, res=1024),
    "glow_beetle": dict(batch="3b", out="cr", arch="mantis", views=["front", "back", "left", "right"], hue=(75, 148), smin=0.38, vmin=0.36, gain=1.75, faces=28000, res=1024),
    "blue_axolotl": dict(batch="3b", out="cr", arch="wolf", views=["front", "back", "left", "right"], hue=(170, 228), smin=0.28, vmin=0.48, gain=1.60, faces=24000, res=1024),
    "bio_turtle": dict(batch="3b", out="cr", arch="wolf", views=["front", "back", "left", "right"], hue=(165, 222), smin=0.32, vmin=0.42, gain=1.65, faces=26000, res=1024),
    "sky_jelly": dict(batch="3b", out="cr", arch="floater", views=["front", "back", "left", "right"], hue=(155, 220), smin=0.22, vmin=0.55, gain=1.50, faces=24000, res=1024),
    "cyber_dragonfly": dict(batch="3b", out="cr", arch="wasp", views=["front", "back", "left", "right"], hue=(168, 228), smin=0.28, vmin=0.42, gain=1.60, faces=26000, res=1024),
    "electric_newt": dict(batch="3b", out="cr", arch="wolf", views=["front", "back", "left", "right"], hue=(175, 232), smin=0.34, vmin=0.38, gain=1.70, faces=26000, res=1024),
    "acid_hornet": dict(batch="3b", out="cr", arch="wasp", views=["front", "back", "left", "right"], hue=(58, 138), smin=0.38, vmin=0.38, gain=1.75, faces=26000, res=1024),
    "venom_caterpillar": dict(batch="3b", out="cr", arch="crawler", views=["front", "back", "left", "right"], hue=(62, 138), smin=0.36, vmin=0.38, gain=1.70, faces=26000, res=1024),
    "poison_salamander": dict(batch="3b", out="cr", arch="wolf", views=["front", "back", "left", "right"], hue=(160, 220), smin=0.34, vmin=0.40, gain=1.65, faces=26000, res=1024),
    "venom_toad": dict(batch="3b", out="cr", arch="wolf", views=["front", "back", "left", "right"], hue=(45, 115), smin=0.38, vmin=0.40, gain=1.65, faces=28000, res=1024),
}


def run(cmd, cwd=ROOT, label=""):
    print(f"  -> [{label}]")
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.stdout.strip():
        for line in r.stdout.strip().splitlines()[-4:]:
            print("     ", line)
    if r.returncode != 0:
        if r.stderr.strip():
            print("  STDERR:\n", r.stderr[-1500:])
        raise RuntimeError(f"Step [{label}] failed with code {r.returncode}")
    return r.stdout


def clean_shape(src: str, dst: str):
    m = trimesh.load(src, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = m.dump(concatenate=True)
    parts = m.split(only_watertight=False)
    if len(parts) > 1:
        m = max(parts, key=lambda p: len(p.faces))
    b = m.bounds
    m.apply_translation([-0.5 * (b[0][0] + b[1][0]), -b[0][1], -0.5 * (b[0][2] + b[1][2])])
    m.export(dst)
    print(f"  -> [clean] {len(parts)} parts -> {len(m.faces)} faces, extents={np.round(m.extents, 3).tolist()}")


def pad_transparent_rgb(src_png: str, dst_png: str, flip_x: bool = False, darken: float = 1.0):
    from scipy.ndimage import distance_transform_edt

    arr = np.array(Image.open(src_png).convert("RGBA"))
    if flip_x:
        arr = arr[:, ::-1, :].copy()
    if darken < 0.99:
        arr[:, :, :3] = np.clip(arr[:, :, :3].astype(np.float32) * darken, 0, 255).astype(np.uint8)
    solid = arr[:, :, 3] >= 140
    if solid.any() and (~solid).any():
        _, (ny, nx) = distance_transform_edt(~solid, return_indices=True)
        out = arr.copy()
        out[:, :, :3] = arr[ny, nx, :3]
        Image.fromarray(out).save(dst_png)
    else:
        Image.fromarray(arr).save(dst_png)


def scale_template_spec(tpl_kind: str, V: np.ndarray) -> dict:
    """Affinely map a proven Elderwood template skeleton (wolf/deer/mantis/wasp/bat/moth) to mesh V's exact bounds."""
    import specs as cr_specs

    orig = cr_specs.SPECS[tpl_kind]["joints"]
    pts = []
    for _, _, pos, o in orig:
        pts.append(pos)
        if "tip" in o:
            pts.append(o["tip"])
        # include mirrored right side for x-span
        pts.append((-pos[0], pos[1], pos[2]))
    pts = np.array(pts, dtype=np.float64)
    t_mn, t_mx = pts.min(0), pts.max(0)
    t_span = np.maximum(t_mx - t_mn, 1e-4)

    v_mn, v_mx = V.min(0), V.max(0)
    v_span = np.maximum(v_mx - v_mn, 1e-4)
    sx = v_span[0] / t_span[0]
    sy = v_span[1] / t_span[1]
    sz = v_span[2] / t_span[2]

    def xf(p):
        return (
            float(p[0] * sx),
            float(v_mn[1] + (p[1] - t_mn[1]) * sy),
            float(v_mn[2] + (p[2] - t_mn[2]) * sz),
        )

    scaled = []
    for name, parent, pos, o in orig:
        no = dict(o)
        if "tip" in no:
            no["tip"] = xf(no["tip"])
        if "r" in no:
            no["r"] = float(no["r"] * min(sx, sy, sz))
        scaled.append((name, parent, (0.0, 0.0, 0.0) if name == "root" else xf(pos), no))
    return dict(kind=cr_specs.SPECS[tpl_kind]["kind"], joints=scaled)


def make_custom_spec(arch: str, V: np.ndarray) -> dict:
    mn, mx = V.min(0), V.max(0)
    span = mx - mn
    W, H, L = span[0], span[1], span[2]
    yc = lambda f: float(mn[1] + f * H)
    zc = lambda f: float(mn[2] + f * L)
    if arch == "biped":
        joints = [
            ("root", None, (0, 0, 0), {}),
            ("pelvis", "root", (0, yc(0.46), zc(0.50)), {}),
            ("spine1", "pelvis", (0, yc(0.58), zc(0.50)), {}),
            ("chest", "spine1", (0, yc(0.72), zc(0.52)), {}),
            ("neck", "chest", (0, yc(0.84), zc(0.54)), {}),
            ("head", "neck", (0, yc(0.90), zc(0.58)), {"tip": (0, yc(0.98), zc(0.68))}),
            ("tail1", "pelvis", (0, yc(0.42), zc(0.36)), {}),
            ("tail2", "tail1", (0, yc(0.28), zc(0.18)), {"tip": (0, yc(0.16), zc(0.02))}),
            ("L_arm", "chest", (W * 0.24, yc(0.74), zc(0.52)), {}),
            ("L_fore", "L_arm", (W * 0.36, yc(0.56), zc(0.54)), {}),
            ("L_hand", "L_fore", (W * 0.44, yc(0.38), zc(0.56)), {"tip": (W * 0.48, yc(0.28), zc(0.58))}),
            ("L_thigh", "pelvis", (W * 0.16, yc(0.44), zc(0.50)), {}),
            ("L_shin", "L_thigh", (W * 0.18, yc(0.24), zc(0.50)), {"fit": "limb"}),
            ("L_foot", "L_shin", (W * 0.18, yc(0.05), zc(0.54)), {"tip": (W * 0.18, yc(0.01), zc(0.66))}),
        ]
    elif arch in ("serpent", "serpent_boss"):
        joints = [
            ("root", None, (0, 0, 0), {}),
            ("pelvis", "root", (0, yc(0.32), zc(0.46)), {}),
            ("spine1", "pelvis", (0, yc(0.48), zc(0.50)), {}),
            ("chest", "spine1", (0, yc(0.64), zc(0.54)), {}),
            ("neck", "chest", (0, yc(0.78), zc(0.58)), {}),
            ("head", "neck", (0, yc(0.88), zc(0.64)), {"tip": (0, yc(0.95), zc(0.78))}),
            ("tail1", "pelvis", (0, yc(0.20), zc(0.34)), {}),
            ("tail2", "tail1", (0, yc(0.14), zc(0.20)), {}),
            ("tail3", "tail2", (0, yc(0.14), zc(0.08)), {"tip": (0, yc(0.18), zc(0.00))}),
            ("L_arm", "chest", (W * 0.16, yc(0.62), zc(0.56)), {}),
            ("L_fore", "L_arm", (W * 0.24, yc(0.46), zc(0.60)), {"tip": (W * 0.28, yc(0.34), zc(0.64))}),
        ]
        if arch == "serpent_boss":
            joints += [
                ("L_wing1", "chest", (W * 0.16, yc(0.66), zc(0.48)), {}),
                ("L_wing2", "L_wing1", (W * 0.34, yc(0.78), zc(0.40)), {}),
                ("L_wing3", "L_wing2", (W * 0.46, yc(0.88), zc(0.32)), {"tip": (W * 0.50, yc(0.94), zc(0.26))}),
            ]
    elif arch == "crawler":
        joints = [
            ("root", None, (0, 0, 0), {}),
            ("seg3", "root", (0, yc(0.40), zc(0.50)), {}),
            ("seg2", "seg3", (0, yc(0.42), zc(0.68)), {}),
            ("seg1", "seg2", (0, yc(0.44), zc(0.84)), {}),
            ("head", "seg1", (0, yc(0.42), zc(0.93)), {"tip": (0, yc(0.38), zc(1.00))}),
            ("seg4", "seg3", (0, yc(0.40), zc(0.34)), {}),
            ("seg5", "seg4", (0, yc(0.38), zc(0.18)), {}),
            ("tail", "seg5", (0, yc(0.35), zc(0.06)), {"tip": (0, yc(0.30), zc(0.00))}),
        ]
    else:  # floater (sky_jelly)
        joints = [
            ("root", None, (0, 0, 0), {}),
            ("bell", "root", (0, yc(0.78), zc(0.50)), {"tip": (0, yc(0.98), zc(0.50))}),
            ("body", "bell", (0, yc(0.56), zc(0.50)), {}),
            ("L_fin", "body", (W * 0.24, yc(0.60), zc(0.50)), {"tip": (W * 0.48, yc(0.56), zc(0.46))}),
            ("L_tend1", "body", (W * 0.14, yc(0.40), zc(0.56)), {}),
            ("L_tend2", "L_tend1", (W * 0.18, yc(0.20), zc(0.54)), {"tip": (W * 0.20, yc(0.02), zc(0.50))}),
            ("tail1", "body", (0, yc(0.34), zc(0.46)), {}),
            ("tail2", "tail1", (0, yc(0.14), zc(0.44)), {"tip": (0, yc(0.01), zc(0.42))}),
        ]
    return dict(kind=arch, joints=joints)


def make_custom_clips(arch: str, J, pos):
    import clips as cr_clips
    Pose, bake, sample = cr_clips.Pose, cr_clips.bake, cr_clips.sample
    names = {n for n, *_ in J}
    out = {}

    def pose_wave(t, period, amp_scale=1.0, fwd_stride=0.0):
        p = Pose()
        w = (t / period) * 2 * np.pi
        s, c = np.sin(w), np.cos(w)
        p.root = np.array([0, s * 0.025 * amp_scale, 0])
        if arch == "biped":
            p.add("spine1", [s * 3 * amp_scale, c * 5 * amp_scale, 0])
            p.add("chest", [s * 2 * amp_scale, -c * 6 * amp_scale, 0])
            p.add("head", [-s * 3 * amp_scale, c * 6 * amp_scale, 0])
            p.add("L_thigh", [s * 26 * fwd_stride, 0, 0]); p.add("R_thigh", [-s * 26 * fwd_stride, 0, 0])
            p.add("L_shin", [max(0, -s) * 28 * fwd_stride, 0, 0]); p.add("R_shin", [max(0, s) * 28 * fwd_stride, 0, 0])
            p.add("L_arm", [-s * 22 * fwd_stride, 0, 5]); p.add("R_arm", [s * 22 * fwd_stride, 0, -5])
            p.add("tail1", [0, c * 14 * amp_scale, 0]); p.add("tail2", [0, np.sin(w - 0.8) * 18 * amp_scale, 0])
        elif arch in ("serpent", "serpent_boss"):
            p.add("spine1", [s * 4 * amp_scale, c * 8 * amp_scale, 0])
            p.add("chest", [-s * 3 * amp_scale, np.sin(w - 0.5) * 8 * amp_scale, 0])
            p.add("head", [s * 4 * amp_scale, np.sin(w - 0.8) * 10 * amp_scale, 0])
            p.add("tail1", [0, c * 14 * amp_scale, 0]); p.add("tail2", [0, np.sin(w - 0.7) * 20 * amp_scale, 0]); p.add("tail3", [0, np.sin(w - 1.4) * 24 * amp_scale, 0])
            if "L_arm" in names:
                p.add("L_arm", [s * 8 * amp_scale, 0, 4]); p.add("R_arm", [-s * 8 * amp_scale, 0, -4])
            for wb in ("L_wing1", "R_wing1", "L_wing2", "R_wing2"):
                if wb in names:
                    sg = 1 if wb.startswith("L_") else -1
                    p.add(wb, [0, sg * s * 8 * amp_scale, sg * s * 16 * amp_scale])
        elif arch == "crawler":
            for i, b in enumerate(("seg1", "seg2", "seg3", "seg4", "seg5", "tail")):
                if b in names:
                    p.add(b, [np.sin(w - i * 0.75) * 12 * amp_scale, np.cos(w - i * 0.75) * 10 * amp_scale, 0])
        else:  # floater
            p.root = np.array([0, s * 0.06 * amp_scale, 0])
            p.add("bell", [s * 6 * amp_scale, 0, c * 5 * amp_scale])
            p.add("L_fin", [0, 0, s * 22 * amp_scale]); p.add("R_fin", [0, 0, -s * 22 * amp_scale])
            for tb in ("L_tend1", "R_tend1", "L_tend2", "R_tend2", "tail1", "tail2"):
                if tb in names:
                    p.add(tb, [np.sin(w - 0.8) * 16 * amp_scale, 0, np.cos(w - 0.5) * 10 * amp_scale])
        return p

    def attack(t):
        p = Pose(); u = t / 1.0
        wind = np.sin(min(u / 0.4, 1.0) * np.pi)
        strike = np.sin(max(0.0, (u - 0.38) / 0.62) * np.pi)
        p.root = np.array([0, wind * 0.06 - strike * 0.03, strike * 0.16 - wind * 0.06])
        for b in ("chest", "neck", "head", "body", "seg1"):
            if b in names:
                p.add(b, [-wind * 14 + strike * 22, 0, 0])
        for b in ("L_arm", "R_arm", "L_wing1", "R_wing1", "L_fin", "R_fin"):
            if b in names:
                sg = 1 if b.startswith("L_") else -1
                p.add(b, [-wind * 24 + strike * 34, 0, sg * (wind * 20 - strike * 18)])
        return p

    def react(kind_r, dur):
        def fn(t):
            p = Pose(); u = t / dur; e = np.sin(u * np.pi) if kind_r != "death" else min(1.0, u) ** 2
            p.root = np.array([0, 0.35 * e if kind_r == "launch" else (-0.25 * e if kind_r in ("death", "knockdown") else 0.0), -0.14 * e])
            if kind_r in ("death", "knockdown"):
                p.add("root", [e * 20, 0, e * 75])
            elif kind_r == "launch":
                p.add("root", [-e * 40, 0, 0])
            for b in ("chest", "head", "body", "bell", "seg1"):
                if b in names:
                    p.add(b, [-e * 18, e * 12 if kind_r == "hit" else 0, 0])
            return p
        return bake(J, pos, sample(fn, dur, False), dur, False, {"source": "authored"})

    out["idle"] = bake(J, pos, sample(lambda t: pose_wave(t, 2.8, 0.7, 0.0), 2.8, True), 2.8, True, {"source": "authored"})
    loco_name = "fly" if arch == "floater" else "walk"
    out[loco_name] = bake(J, pos, sample(lambda t: pose_wave(t, 1.1, 1.2, 1.0), 1.1, True), 1.1, True, {"source": "authored"})
    out["run"] = bake(J, pos, sample(lambda t: pose_wave(t, 0.75, 1.5, 1.3), 0.75, True), 0.75, True, {"source": "authored"})
    out["attack"] = bake(J, pos, sample(attack, 1.0, False), 1.0, False, {"source": "authored"})
    for rn, dur in (("hit", 0.45), ("hit_heavy", 0.8), ("parried", 0.9), ("launch", 0.9), ("knockdown", 1.0), ("get_up", 1.0), ("death", 1.4)):
        out[rn] = react(rn, dur)
    out["crouch"] = bake(J, pos, [Pose(), Pose()], 1.0, True, {"source": "authored", "layer": True})
    out["tell"] = bake(J, pos, [attack(0.25), attack(0.25)], 1.0, True, {"source": "authored", "layer": True})
    return out


def compress_glb_textures_jpeg(glb_path: str, quality: int = 90):
    """Re-encode PNG textures inside a GLB to compact JPEG (matching existing Elderwood creatures ~2.5-4 MB)."""
    from glbio import read_glb, write_glb

    j, bin_ = read_glb(glb_path)
    views = j.get("bufferViews", [])
    images = j.get("images", [])
    replaced = {}
    for im in images:
        bv_idx = im.get("bufferView")
        if bv_idx is None or im.get("mimeType") == "image/jpeg":
            continue
        v = views[bv_idx]
        o = v.get("byteOffset", 0)
        raw = bin_[o : o + v["byteLength"]]
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
        buf = io.BytesIO()
        pil.save(buf, format="JPEG", quality=quality, optimize=True)
        replaced[bv_idx] = buf.getvalue()
        im["mimeType"] = "image/jpeg"

    if not replaced:
        return
    write_glb(glb_path, j, bin_, replace=replaced)


def finish_one(cid: str):
    spec = SPECS[cid]
    scratch = B3A_SCRATCH if spec["batch"] == "3a" else B3B_SCRATCH
    src_dir = os.path.join(scratch, "outputs", cid)
    cut_dir = os.path.join(src_dir, "cutouts")
    raw_glb = os.path.join(src_dir, "shape_raw.glb")
    wdir = os.path.join(WORK_ROOT, cid)
    ref_dir = os.path.join(wdir, "ref")
    os.makedirs(ref_dir, exist_ok=True)
    print(f"\n==================== FINISHING {cid} ({spec['arch']} -> {spec['out']}) ====================")

    for vname in ("front", "back", "left"):
        src = os.path.join(cut_dir, f"{vname}.png")
        if os.path.isfile(src):
            pad_transparent_rgb(src, os.path.join(ref_dir, f"{vname}.png"), flip_x=False)
    left_src = os.path.join(cut_dir, "left.png")
    if os.path.isfile(left_src):
        pad_transparent_rgb(left_src, os.path.join(ref_dir, "right.png"), flip_x=True)
        shutil.copy2(os.path.join(ref_dir, "left.png"), os.path.join(ref_dir, "side.png"))
    if "back_mirror" in spec["views"]:
        pad_transparent_rgb(os.path.join(cut_dir, "front.png"), os.path.join(ref_dir, "back.png"), flip_x=True, darken=0.85)

    clean_glb = os.path.join(wdir, "shape_clean.glb")
    clean_shape(raw_glb, clean_glb)

    painted_glb = os.path.join(wdir, "painted.glb")
    paint_cmd = [
        PY, os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py"),
        "--mesh", clean_glb, "--out", painted_glb, "--faces", str(spec["faces"]), "--res", str(spec["res"]),
    ]
    for vk in spec["views"]:
        vk_mapped = "back" if vk == "back_mirror" else vk
        paint_cmd += ["--view", f"{vk_mapped}={os.path.join(ref_dir, vk_mapped + '.png')}"]
    run(paint_cmd, cwd=os.path.join(ROOT, "engines", "tela-3d"), label=f"{cid} paint")

    em_glb = os.path.join(wdir, "emissive.glb")
    h0, h1 = spec["hue"]
    run([
        PY, os.path.join(ROOT, "scripts", "riftrealm", "add_emissive.py"),
        painted_glb, em_glb,
        "--hue", str(h0), str(h1),
        "--smin", str(spec["smin"]),
        "--vmin", str(spec["vmin"]),
        "--gain", str(spec["gain"]),
    ], label=f"{cid} emissive")

    from glbio import read_glb, accessor
    import specs as cr_specs
    import rig as cr_rig
    import clips as cr_clips

    j, b = read_glb(em_glb)
    prim = j["meshes"][0]["primitives"][0]
    V = accessor(j, b, prim["attributes"]["POSITION"]).astype(np.float64)
    F = accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)

    arch = spec["arch"]
    if arch in ("wolf", "deer", "mantis", "wasp", "bat", "moth"):
        cr_specs.SPECS[cid] = scale_template_spec(arch, V)
        J, pos = cr_rig.fit(cid, V)
        idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
        clips_data = cr_clips.make(arch, J, pos)
    else:
        cr_specs.SPECS[cid] = make_custom_spec(arch, V)
        J, pos = cr_rig.fit(cid, V)
        idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
        clips_data = make_custom_clips(arch, J, pos)

    if spec["out"] == "char":
        final_glb = os.path.join(CHAR_ASSETS, f"{cid}.glb")
    else:
        os.makedirs(CR_RIGGED, exist_ok=True)
        final_glb = os.path.join(CR_RIGGED, f"{cid}.glb")

    cr_rig.write_rigged(cid, j, b, J, pos, idx, wt, names, clips_data, final_glb)
    if spec["out"] == "cr":
        compress_glb_textures_jpeg(final_glb, quality=90)
    print(f"  -> [rig] {len(names)} bones, {len(clips_data)} clips -> {final_glb} ({os.path.getsize(final_glb) / 1e6:.2f} MB)")

    render_dir = os.path.join(wdir, "render_all")
    run(["node", os.path.join(ROOT, "scripts", "riftrealm", "render_views.mjs"), final_glb, render_dir], label=f"{cid} render")


def main():
    targets = sys.argv[1:] or list(SPECS.keys())
    for cid in targets:
        finish_one(cid)


if __name__ == "__main__":
    main()

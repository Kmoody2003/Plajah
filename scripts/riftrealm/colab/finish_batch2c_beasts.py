"""Local CPU finishing pipeline for Vesselbound Batch 2C Mounts & Colossal Bosses (8 models).

Outputs rigged GLBs with embedded animations into public/games/rift-realm/assets/characters/:
  Quadruped Mounts / Beasts (4):
    - panther_demon        (28-bone quadruped geodesic rig + 13 wolf clips, neon-magenta emissive)
    - light_panther_mount  (28-bone quadruped geodesic rig + 13 wolf clips, cyan emissive)
    - crystal_stag         (deer quadruped geodesic rig + deer clips, cyan/gold crystal antler emissive)
    - obsidian_rhino       (28-bone heavy quadruped geodesic rig + 13 wolf clips, volcanic lava emissive)
  Winged Dragons (2):
    - cyber_dragon_mount   (winged quadruped dragon geodesic rig + clips, gold emissive)
    - rune_dragon          (winged quadruped dragon geodesic rig + clips, frost-cyan emissive)
  Colossal World Bosses (2):
    - marsh_kraken         (multi-head hydra + radial tentacle geodesic rig + boss clips, bio-green emissive)
    - void_leviathan       (serpentine winged boss geodesic rig + boss clips, golden flame emissive; uses Batch 3A redo if present)

Usage:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/riftrealm/colab/finish_batch2c_beasts.py [id ...]
"""
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

B2C_SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch2c"
B3A_OUT = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch\colab_batch3a\outputs"
WORK_ROOT = os.path.join(B2C_SCRATCH, "work_beasts")
CHAR_ASSETS = os.path.join(ROOT, "public", "games", "rift-realm", "assets", "characters")

sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "ravencrest"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm", "creatures"))

SPECS = {
    "panther_demon": {
        "rig_kind": "quad_wolf",
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (275, 345), "smin": 0.32, "vmin": 0.30, "gain": 1.75,
        "faces": 52000,
    },
    "light_panther_mount": {
        "rig_kind": "quad_wolf",
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (168, 215), "smin": 0.34, "vmin": 0.36, "gain": 1.70,
        "faces": 52000,
    },
    "crystal_stag": {
        "rig_kind": "quad_deer",
        "paint_views": ["front", "left", "right"],
        "emissive_hue": (162, 215), "smin": 0.25, "vmin": 0.45, "gain": 1.60,
        "faces": 52000,
    },
    "obsidian_rhino": {
        "rig_kind": "quad_wolf",
        "paint_views": ["front"],
        "emissive_hue": (6, 52), "smin": 0.44, "vmin": 0.36, "gain": 1.80,
        "faces": 52000,
    },
    "cyber_dragon_mount": {
        "rig_kind": "winged_dragon",
        "paint_views": ["front", "back", "left", "right"],
        "emissive_hue": (18, 60), "smin": 0.38, "vmin": 0.40, "gain": 1.65,
        "faces": 56000,
    },
    "rune_dragon": {
        "rig_kind": "winged_dragon",
        "paint_views": ["front"],
        "emissive_hue": (175, 228), "smin": 0.28, "vmin": 0.42, "gain": 1.65,
        "faces": 58000,
    },
    "marsh_kraken": {
        "rig_kind": "kraken_boss",
        "paint_views": ["front"],
        "emissive_hue": (95, 165), "smin": 0.36, "vmin": 0.36, "gain": 1.70,
        "faces": 58000,
    },
    "void_leviathan": {
        "rig_kind": "serpent_boss",
        "paint_views": ["front"],
        "emissive_hue": (16, 62), "smin": 0.36, "vmin": 0.42, "gain": 1.80,
        "faces": 58000,
    },
}


def run(cmd, cwd=ROOT, label=""):
    print(f"  -> [{label}]")
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.stdout.strip():
        for line in r.stdout.strip().splitlines()[-5:]:
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


def pad_transparent_rgb(src_png: str, dst_png: str, flip_x: bool = False):
    from scipy.ndimage import distance_transform_edt

    arr = np.array(Image.open(src_png).convert("RGBA"))
    if flip_x:
        arr = arr[:, ::-1, :].copy()
    solid = arr[:, :, 3] >= 140
    if solid.any() and (~solid).any():
        _, (ny, nx) = distance_transform_edt(~solid, return_indices=True)
        out = arr.copy()
        out[:, :, :3] = arr[ny, nx, :3]
        Image.fromarray(out).save(dst_png)
    else:
        Image.fromarray(arr).save(dst_png)


def make_quad_spec(V: np.ndarray, is_deer: bool = False, with_wings: bool = False) -> dict:
    mn, mx = V.min(0), V.max(0)
    span = mx - mn
    W, H, L = span[0], span[1], span[2]
    yc = lambda f: mn[1] + f * H
    zc = lambda f: mn[2] + f * L
    head_y = 0.72 if is_deer else 0.62
    neck_y = 0.62 if is_deer else 0.65
    pelvis_y = 0.50 if is_deer else 0.54
    joints = [
        ("root", None, (0, 0, 0), {}),
        ("pelvis", "root", (0, yc(pelvis_y), zc(0.30)), {}),
        ("spine1", "pelvis", (0, yc(pelvis_y + 0.03), zc(0.48)), {}),
        ("chest", "spine1", (0, yc(pelvis_y + 0.04), zc(0.66)), {}),
        ("neck", "chest", (0, yc(neck_y), zc(0.78)), {}),
        ("head", "neck", (0, yc(head_y), zc(0.88)), {"tip": (0, yc(head_y - 0.04), zc(1.00))}),
        ("jaw", "head", (0, yc(head_y - 0.07), zc(0.90)), {"tip": (0, yc(head_y - 0.11), zc(0.98)), "r": 0.03}),
        ("tail1", "pelvis", (0, yc(pelvis_y), zc(0.20)), {}),
        ("tail2", "tail1", (0, yc(pelvis_y - 0.12), zc(0.10)), {}),
        ("tail3", "tail2", (0, yc(pelvis_y - 0.24), zc(0.03)), {"tip": (0, yc(max(0.08, pelvis_y - 0.36)), zc(0.00))}),
        ("L_scap", "chest", (W * 0.14, yc(pelvis_y + 0.02), zc(0.66)), {}),
        ("L_arm", "L_scap", (W * 0.19, yc(pelvis_y * 0.76), zc(0.68)), {"fit": "limb"}),
        ("L_fore", "L_arm", (W * 0.20, yc(pelvis_y * 0.50), zc(0.67)), {"fit": "limb"}),
        ("L_wrist", "L_fore", (W * 0.21, yc(pelvis_y * 0.22), zc(0.71)), {"fit": "limb"}),
        ("L_paw", "L_wrist", (W * 0.22, yc(0.04), zc(0.76)), {"tip": (W * 0.22, yc(0.01), zc(0.82))}),
        ("L_thigh", "pelvis", (W * 0.17, yc(pelvis_y - 0.03), zc(0.30)), {}),
        ("L_shin", "L_thigh", (W * 0.19, yc(pelvis_y * 0.64), zc(0.34)), {"fit": "limb"}),
        ("L_hock", "L_shin", (W * 0.19, yc(pelvis_y * 0.36), zc(0.24)), {"fit": "limb"}),
        ("L_foot", "L_hock", (W * 0.21, yc(0.04), zc(0.30)), {"tip": (W * 0.22, yc(0.01), zc(0.36))}),
    ]
    if with_wings:
        joints += [
            ("L_wing1", "chest", (W * 0.16, yc(0.66), zc(0.60)), {}),
            ("L_wing2", "L_wing1", (W * 0.34, yc(0.84), zc(0.46)), {}),
            ("L_wing3", "L_wing2", (W * 0.46, yc(0.92), zc(0.32)), {"tip": (W * 0.50, yc(0.96), zc(0.20))}),
        ]
    return dict(kind="quadruped", joints=joints)


def make_boss_spec(V: np.ndarray, kind: str) -> dict:
    mn, mx = V.min(0), V.max(0)
    span = mx - mn
    W, H, L = span[0], span[1], span[2]
    yc = lambda f: mn[1] + f * H
    zc = lambda f: mn[2] + f * L
    if kind == "kraken_boss":
        joints = [
            ("root", None, (0, 0, 0), {}),
            ("body", "root", (0, yc(0.42), zc(0.50)), {}),
            ("mantle", "body", (0, yc(0.62), zc(0.48)), {"tip": (0, yc(0.76), zc(0.45))}),
            ("L_neck_in", "body", (W * 0.14, yc(0.70), zc(0.52)), {}),
            ("L_head_in", "L_neck_in", (W * 0.20, yc(0.88), zc(0.60)), {"tip": (W * 0.22, yc(0.94), zc(0.72))}),
            ("L_neck_out", "body", (W * 0.28, yc(0.62), zc(0.50)), {}),
            ("L_head_out", "L_neck_out", (W * 0.38, yc(0.76), zc(0.56)), {"tip": (W * 0.42, yc(0.80), zc(0.68))}),
            ("L_tent_f1", "body", (W * 0.16, yc(0.30), zc(0.62)), {}),
            ("L_tent_f2", "L_tent_f1", (W * 0.30, yc(0.18), zc(0.78)), {"tip": (W * 0.44, yc(0.12), zc(0.92))}),
            ("L_tent_s1", "body", (W * 0.22, yc(0.32), zc(0.46)), {}),
            ("L_tent_s2", "L_tent_s1", (W * 0.40, yc(0.24), zc(0.44)), {"tip": (W * 0.50, yc(0.34), zc(0.48))}),
            ("L_tent_b1", "body", (W * 0.18, yc(0.26), zc(0.34)), {}),
            ("L_tent_b2", "L_tent_b1", (W * 0.32, yc(0.12), zc(0.18)), {"tip": (W * 0.40, yc(0.06), zc(0.06))}),
        ]
    else:  # serpent_boss (void_leviathan)
        joints = [
            ("root", None, (0, 0, 0), {}),
            ("pelvis", "root", (0, yc(0.30), zc(0.46)), {}),
            ("spine1", "pelvis", (0, yc(0.46), zc(0.50)), {}),
            ("chest", "spine1", (0, yc(0.62), zc(0.54)), {}),
            ("neck", "chest", (0, yc(0.76), zc(0.58)), {}),
            ("head", "neck", (0, yc(0.88), zc(0.64)), {"tip": (0, yc(0.94), zc(0.78))}),
            ("tail1", "pelvis", (0, yc(0.20), zc(0.34)), {}),
            ("tail2", "tail1", (0, yc(0.14), zc(0.20)), {}),
            ("tail3", "tail2", (0, yc(0.16), zc(0.08)), {"tip": (0, yc(0.22), zc(0.00))}),
            ("L_arm", "chest", (W * 0.12, yc(0.58), zc(0.56)), {}),
            ("L_fore", "L_arm", (W * 0.18, yc(0.46), zc(0.60)), {"tip": (W * 0.20, yc(0.36), zc(0.64))}),
            ("L_wing1", "chest", (W * 0.16, yc(0.66), zc(0.48)), {}),
            ("L_wing2", "L_wing1", (W * 0.34, yc(0.78), zc(0.40)), {}),
            ("L_wing3", "L_wing2", (W * 0.46, yc(0.88), zc(0.32)), {"tip": (W * 0.50, yc(0.94), zc(0.26))}),
        ]
    return dict(kind=kind, joints=joints)


def make_boss_clips(kind: str, J, pos):
    import clips as cr_clips
    Pose = cr_clips.Pose
    bake = cr_clips.bake
    sample = cr_clips.sample
    names = {n for n, *_ in J}
    out = {}

    def idle(t):
        p = Pose()
        s = np.sin(t / 3.2 * 2 * np.pi)
        c = np.cos(t / 3.2 * 2 * np.pi)
        p.root = np.array([0, s * 0.02, 0])
        if "body" in names:
            p.add("body", [s * 3.0, c * 4.0, 0])
        if "chest" in names:
            p.add("chest", [s * 3.5, c * 3.0, 0])
        if "neck" in names:
            p.add("neck", [-s * 4.0, c * 6.0, 0])
        if "head" in names:
            p.add("head", [s * 5.0, c * 8.0, 0])
        for b in names:
            if "wing1" in b:
                sg = 1 if b.startswith("L_") else -1
                p.add(b, [0, sg * s * 8.0, sg * s * 14.0])
            elif "wing2" in b:
                sg = 1 if b.startswith("L_") else -1
                p.add(b, [0, 0, sg * c * 10.0])
            elif "neck_" in b or "head_" in b:
                sg = 1 if b.startswith("L_") else -1
                p.add(b, [s * 6.0, sg * c * 10.0, sg * s * 4.0])
            elif "tent_" in b:
                sg = 1 if b.startswith("L_") else -1
                p.add(b, [c * 12.0, sg * s * 14.0, sg * c * 8.0])
            elif b.startswith("tail"):
                p.add(b, [s * 4.0, c * 10.0, 0])
        return p

    def attack(t):
        p = Pose()
        u = t / 1.2
        wind = np.sin(min(u / 0.45, 1.0) * np.pi)
        strike = np.sin(max(0.0, (u - 0.40) / 0.60) * np.pi)
        p.root = np.array([0, wind * 0.08 - strike * 0.04, strike * 0.18 - wind * 0.08])
        for b in names:
            if b in ("body", "chest", "neck", "head"):
                p.add(b, [-wind * 12.0 + strike * 16.0, 0, 0])
            elif "wing1" in b:
                sg = 1 if b.startswith("L_") else -1
                p.add(b, [0, sg * (-wind * 18 + strike * 22), sg * (wind * 26 - strike * 20)])
            elif "head_" in b or "neck_" in b:
                p.add(b, [-wind * 14.0 + strike * 22.0, 0, 0])
            elif "tent_" in b:
                sg = 1 if b.startswith("L_") else -1
                p.add(b, [-wind * 16.0 + strike * 28.0, sg * (-wind * 10 + strike * 15), 0])
        return p

    def hit(t):
        p = Pose()
        u = t / 0.55
        fl = np.sin(u * np.pi)
        p.root = np.array([0, 0, -fl * 0.12])
        for b in names:
            if b in ("body", "chest", "neck", "head"):
                p.add(b, [-fl * 14.0, fl * 8.0, 0])
        return p

    def death(t):
        p = Pose()
        u = min(1.0, t / 1.5)
        e = u * u * (3 - 2 * u)
        p.root = np.array([0, -e * 0.35, -e * 0.20])
        p.add("root", [e * 28.0, 0, e * 35.0])
        for b in names:
            if b in ("chest", "neck", "head", "body"):
                p.add(b, [e * 18.0, 0, 0])
            elif "wing1" in b:
                sg = 1 if b.startswith("L_") else -1
                p.add(b, [0, 0, -sg * e * 32.0])
        return p

    out["idle"] = bake(J, pos, sample(idle, 3.2, True), 3.2, True, {"source": "authored"})
    out["run"] = bake(J, pos, sample(idle, 1.8, True), 1.8, True, {"source": "authored"})
    out["attack"] = bake(J, pos, sample(attack, 1.2, False), 1.2, False, {"source": "authored"})
    out["hit"] = bake(J, pos, sample(hit, 0.55, False), 0.55, False, {"source": "authored"})
    out["death"] = bake(J, pos, sample(death, 1.5, False), 1.5, False, {"source": "authored"})
    return out


def add_dragon_wing_motion(clips_data: dict, J, pos):
    """Layer gentle wing flaps onto quadruped dragon clips."""
    import rig as cr_rig
    names = [n for n, *_ in J]
    wing_bones = [n for n in names if "wing" in n]
    if not wing_bones:
        return
    for cname, c in clips_data.items():
        ts = c["times"]
        dur = max(0.1, float(ts[-1] - ts[0]))
        amp = 22.0 if cname in ("run", "gallop", "trot", "attack") else 8.0
        for wb in wing_bones:
            sg = 1.0 if wb.startswith("L_") else -1.0
            phase = 0.0 if "wing1" in wb else (0.5 if "wing2" in wb else 1.0)
            qs = []
            for t in ts:
                ang = sg * np.sin((t / dur) * 2 * np.pi - phase) * amp
                qs.append(cr_rig.quat_from_euler(0.0, ang * 0.25, ang))
            qs = np.array(qs)
            for i in range(1, len(qs)):
                if np.dot(qs[i], qs[i - 1]) < 0:
                    qs[i] = -qs[i]
            c["rot"][wb] = qs


def resolve_src(cid: str) -> str:
    if cid == "void_leviathan":
        redo = os.path.join(B3A_OUT, "void_leviathan")
        if os.path.isfile(os.path.join(redo, "shape_raw.glb")):
            return redo
    return os.path.join(B2C_SCRATCH, "outputs", cid)


def finish_one(cid: str):
    spec = SPECS[cid]
    src_dir = resolve_src(cid)
    cut_dir = os.path.join(src_dir, "cutouts")
    raw_glb = os.path.join(src_dir, "shape_raw.glb")
    wdir = os.path.join(WORK_ROOT, cid)
    ref_dir = os.path.join(wdir, "ref")
    os.makedirs(ref_dir, exist_ok=True)
    print(f"\n==================== FINISHING BEAST {cid} ({spec['rig_kind']}) ====================")

    for vname in ("front", "back", "left"):
        src = os.path.join(cut_dir, f"{vname}.png")
        if os.path.isfile(src):
            pad_transparent_rgb(src, os.path.join(ref_dir, f"{vname}.png"), flip_x=False)
    left_src = os.path.join(cut_dir, "left.png")
    if os.path.isfile(left_src):
        pad_transparent_rgb(left_src, os.path.join(ref_dir, "right.png"), flip_x=True)
        shutil.copy2(os.path.join(ref_dir, "left.png"), os.path.join(ref_dir, "side.png"))

    clean_glb = os.path.join(wdir, "shape_clean.glb")
    clean_shape(raw_glb, clean_glb)

    painted_glb = os.path.join(wdir, "painted.glb")
    paint_cmd = [
        PY, os.path.join(ROOT, "engines", "tela-3d", "paint_from_views.py"),
        "--mesh", clean_glb, "--out", painted_glb, "--faces", str(spec["faces"]), "--res", "2048",
    ]
    for vk in spec["paint_views"]:
        paint_cmd += ["--view", f"{vk}={os.path.join(ref_dir, vk + '.png')}"]
    run(paint_cmd, cwd=os.path.join(ROOT, "engines", "tela-3d"), label=f"{cid} paint")

    em_glb = os.path.join(wdir, "emissive.glb")
    h0, h1 = spec["emissive_hue"]
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

    rk = spec["rig_kind"]
    if rk == "quad_wolf":
        cr_specs.SPECS[cid] = make_quad_spec(V, is_deer=False, with_wings=False)
        J, pos = cr_rig.fit(cid, V)
        idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
        clips_data = cr_clips.quad_clips("wolf", J, pos)
    elif rk == "quad_deer":
        cr_specs.SPECS[cid] = make_quad_spec(V, is_deer=True, with_wings=False)
        J, pos = cr_rig.fit(cid, V)
        idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
        clips_data = cr_clips.quad_clips("deer", J, pos)
    elif rk == "winged_dragon":
        cr_specs.SPECS[cid] = make_quad_spec(V, is_deer=False, with_wings=True)
        J, pos = cr_rig.fit(cid, V)
        idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
        clips_data = cr_clips.quad_clips("wolf", J, pos)
        add_dragon_wing_motion(clips_data, J, pos)
    else:
        cr_specs.SPECS[cid] = make_boss_spec(V, rk)
        J, pos = cr_rig.fit(cid, V)
        idx, wt, names = cr_rig.skin(cid, V, F, J, pos)
        clips_data = make_boss_clips(rk, J, pos)

    final_glb = os.path.join(CHAR_ASSETS, f"{cid}.glb")
    os.makedirs(CHAR_ASSETS, exist_ok=True)
    cr_rig.write_rigged(cid, j, b, J, pos, idx, wt, names, clips_data, final_glb)
    print(f"  -> [rig] {len(names)} bones, {len(clips_data)} clips -> {final_glb} ({os.path.getsize(final_glb) / 1e6:.2f} MB)")

    render_dir = os.path.join(wdir, "render_all")
    run(["node", os.path.join(ROOT, "scripts", "riftrealm", "render_views.mjs"), final_glb, render_dir], label=f"{cid} render")


def main():
    targets = sys.argv[1:] or [k for k in SPECS if k != "void_leviathan"]
    for cid in targets:
        finish_one(cid)


if __name__ == "__main__":
    main()

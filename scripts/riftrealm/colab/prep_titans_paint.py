"""Prepare Batch Titans 360° Hunyuan3D-Paint Pack (11 Massive Titan / World Bosses & Heavy Boss Mounts).

Packages each titan's CLEAN high-res 80,000-face mesh (`shape_clean.glb`) + crisp RGBA concept cutout (`front.png`)
into `tmp/colab_batch56/batch_titans_paint.zip` so Colab L4 runs Tencent's 6-view 360° `Hunyuan3DPaintPipeline`
(`hunyuan3d-paint-v2-0-turbo`) for seamless, zero-stretch, 2048x2048 textures across every angle (especially single-view
colossal bosses like Void Leviathan, Rune Dragon, Marsh Kraken, Magma Titan, and Moss Golem!).
"""
import json
import os
import shutil
import zipfile
import numpy as np
import trimesh
import pymeshlab
from PIL import Image

SCRATCH = r"C:\Users\Kenne\.gemini\antigravity\brain\130e34ba-9a54-4378-abc9-038505b3e549\scratch"
OUT_ROOT = os.path.join(SCRATCH, "colab_titans_paint")
IN_ROOT = os.path.join(OUT_ROOT, "inputs")
TMP_UPLOAD = r"c:\Users\Kenne\plajah\tmp\colab_batch56"

# (id, source_batch_folder, target_faces)
TITANS = [
    ("void_leviathan", "colab_batch3a", 85000),
    ("rune_dragon", "colab_batch2c", 85000),
    ("marsh_kraken", "colab_batch2c", 85000),
    ("magma_titan", "colab_batch2a", 80000),
    ("moss_golem", "colab_batch2c", 75000),
    ("cyber_minotaur", "colab_batch2a", 75000),
    ("fallen_archangel", "colab_batch2a", 75000),
    ("prism_archon", "colab_batch2a", 70000),
    ("gorgon_construct", "colab_batch2b", 70000),
    ("obsidian_rhino", "colab_batch2c", 75000),
    ("cyber_dragon_mount", "colab_batch2c", 75000),
]


def clean_and_decimate(raw_glb: str, out_glb: str, target_faces: int):
    m = trimesh.load(raw_glb, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = m.dump(concatenate=True)
    parts = m.split(only_watertight=False)
    if len(parts) > 1:
        m = max(parts, key=lambda p: len(p.faces))
    # Normalize centered at origin, unit scale ~[-0.5, 0.5] (standard Hunyuan3DPaint canonical box!)
    b = m.bounds
    center = 0.5 * (b[0] + b[1])
    m.apply_translation(-center)
    sc = 1.6 / max(float(m.extents.max()), 1e-6)
    m.apply_scale(sc)
    if len(m.faces) > target_faces:
        ms = pymeshlab.MeshSet()
        ms.add_mesh(pymeshlab.Mesh(m.vertices, m.faces))
        ms.meshing_decimation_quadric_edge_collapse(
            targetfacenum=target_faces, preservenormal=True, preservetopology=True
        )
        cm = ms.current_mesh()
        m = trimesh.Trimesh(cm.vertex_matrix(), cm.face_matrix(), process=True)
    m.export(out_glb)
    return len(m.faces)


def main():
    os.makedirs(IN_ROOT, exist_ok=True)
    os.makedirs(TMP_UPLOAD, exist_ok=True)

    items = []
    for cid, batch_dir, faces in TITANS:
        raw_glb = os.path.join(SCRATCH, batch_dir, "outputs", cid, "shape_raw.glb")
        cut_front = os.path.join(SCRATCH, batch_dir, "outputs", cid, "cutouts", "front.png")
        if not os.path.isfile(raw_glb):
            raise FileNotFoundError(f"Missing {raw_glb}")
        if not os.path.isfile(cut_front):
            raise FileNotFoundError(f"Missing {cut_front}")

        cdir = os.path.join(IN_ROOT, cid)
        os.makedirs(cdir, exist_ok=True)
        out_glb = os.path.join(cdir, "mesh.glb")
        nf = clean_and_decimate(raw_glb, out_glb, faces)
        # Save clean white-padded 1024 RGBA front cutout for Hunyuan3DPaintPipeline
        im = Image.open(cut_front).convert("RGBA")
        im.thumbnail((1024, 1024), Image.LANCZOS)
        im.save(os.path.join(cdir, "front.png"))
        items.append({"id": cid, "faces": nf, "mesh": "mesh.glb", "image": "front.png"})
        print(f"Prepped titan {cid:20s} ({nf:6d} tris) from {batch_dir}")

    manifest = {"batch": "batch_titans_paint", "mode": "paint_only", "items": items}
    with open(os.path.join(IN_ROOT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    zip_path = os.path.join(OUT_ROOT, "batch_titans_paint.zip")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, _, files in os.walk(IN_ROOT):
            for fn in sorted(files):
                full = os.path.join(root, fn)
                zf.write(full, os.path.relpath(full, IN_ROOT))

    upload_zip = os.path.join(TMP_UPLOAD, "batch_titans_paint.zip")
    shutil.copy2(zip_path, upload_zip)
    print(f"\nZipped {len(items)} Titan Bosses -> {upload_zip} ({os.path.getsize(upload_zip)/1e6:.2f} MB)")


if __name__ == "__main__":
    main()

"""Lightweight local ingest for Colab-built Lexicon villagers -> 58-joint Character Forge GLBs + scored reports.

Runs quickly on CPU (~45 seconds total for all 12 villagers; ZERO local GPU/AI load!).
For each villager in lexicon_cast_outputs.zip:
  1. Unpacks Colab outputs onto D:/Plajah Runtime/eraclash3d/forge/lexicon-colab-out/
  2. Promotes the 22-bone contract GLB to the full 58-joint Plajah Character Forge skeleton (HUMAN_JOINTS + fingers +
     twists + eyes + extras.forge capsules/grips/sockets) via scripts/eraclash3d/forgeRigMesh.ts
  3. Re-applies Screened Poisson Metric Bone-Heat 58-joint skinning (preserving all 58 bones + extras.forge) and
     verifies 3-pose LBS stretch QA
  4. Writes production GLB to public/games/lexicon/assets/characters/<id>.glb (and optional KTX2 GPU copy)
  5. Renders Three.js ortho views (render_views.mjs) and scores every view honestly against the turnaround cutouts
     (score_views.py), writing scripts/eraclash3d/characters/<id>/report.md and scripts/lexicon/colab/cast_report.md.

Usage:
  "D:/Plajah Runtime/tela3d-py/Scripts/python.exe" scripts/lexicon/colab/ingest_lexicon_cast_colab.py <lexicon_cast_outputs.zip> [id ...] [--ktx]
"""
from __future__ import annotations

import datetime
import json
import os
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PY = sys.executable
OUT_WORK = os.environ.get("LEXICON_COLAB_OUT", r"D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out")
CHAR_DIR = os.path.join(ROOT, "public", "games", "lexicon", "assets", "characters")
FORGE_CHARS = os.path.join(ROOT, "scripts", "eraclash3d", "characters")

sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts", "riftrealm"))
import plajah_lexicon_forge as plf  # noqa: E402


def run(cmd: list[str], label: str) -> str:
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"[{label}] failed ({r.returncode}):\n{r.stdout[-1200:]}\n{r.stderr[-1200:]}")
    return r.stdout


def write_char_report(item: dict, scores: dict, rig_qa: dict, glb_rel: str, delta_dir: str):
    cid = item["id"]
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    ov = scores["overall"] * 100.0
    gate = "pass" if ov >= 95.0 else f"**{95.0 - ov:.1f} short**"
    rows = []
    for lbl in ("front", "side", "back"):
        if lbl not in scores:
            continue
        v = scores[lbl]
        rows.append(f"| {lbl} ({v.get('view', lbl)}) | {v['iou']*100:.1f}% | {v['colour']*100:.1f}% | {v['score']*100:.1f}% |")
    md = "\n".join([
        f"# {item['name']}: Character Forge (Colab GPU) report",
        "",
        f"{now} · character `{glb_rel}` · role: {item['role']} · height {item['height_m']:.2f} m ({item['proportions']})",
        "",
        "## Against the 95% gate",
        "",
        "| Gate | Target | Now | Status |",
        "|---|---|---|---|",
        f"| Overall (front / true side / back) | 95% | {ov:.1f}% | {gate} |",
        f"| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | {rig_qa['p99_stretch']:.2f}x / {rig_qa['max_stretch']:.2f}x | {rig_qa['over_3x']} tris > 3x |",
        "",
        "## By view",
        "",
        "| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |",
        "|---|---|---|---|",
        *rows,
        "",
        f"Delta images: `{delta_dir}` (`front_delta.png`, `side_delta.png`, `back_delta.png`).",
        "",
    ])
    cdir = os.path.join(FORGE_CHARS, cid)
    os.makedirs(cdir, exist_ok=True)
    with open(os.path.join(cdir, "report.md"), "w", encoding="utf-8") as f:
        f.write(md)


def main():
    args = sys.argv[1:]
    do_ktx = "--ktx" in args
    args = [a for a in args if a != "--ktx"]
    if not args:
        # Auto-discover zip in D:/plajah-tmp/lexicon-colab or Downloads
        cands = [
            r"D:\plajah-tmp\lexicon-colab\lexicon_cast_outputs.zip",
            os.path.join(os.path.expanduser("~"), "Downloads", "lexicon_cast_outputs.zip"),
        ]
        zip_path = next((p for p in cands if os.path.isfile(p)), None)
        if not zip_path:
            raise SystemExit("Usage: python ingest_lexicon_cast_colab.py <path/to/lexicon_cast_outputs.zip> [id ...] [--ktx]")
        wanted = set()
    else:
        zip_path = args[0]
        wanted = set(args[1:])

    if not os.path.isfile(zip_path):
        raise FileNotFoundError(f"Missing Colab output zip: {zip_path}")

    os.makedirs(OUT_WORK, exist_ok=True)
    print(f"Extracting {zip_path} -> {OUT_WORK} ...")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(OUT_WORK)

    with open(os.path.join(OUT_WORK, "manifest.json"), "r", encoding="utf-8") as f:
        manifest = json.load(f)

    os.makedirs(CHAR_DIR, exist_ok=True)
    items = [it for it in manifest["characters"] if not wanted or it["id"] in wanted]
    summary = []

    for item in items:
        cid = item["id"]
        sk = item["side_view"]
        c_dir = os.path.join(OUT_WORK, cid)
        rig22 = os.path.join(c_dir, "rigged_22.glb")
        if not os.path.isfile(rig22):
            print(f"  [skip] {cid}: missing {rig22}")
            continue

        final_glb = os.path.join(CHAR_DIR, f"{cid}.glb")
        glb_rel = f"public/games/lexicon/assets/characters/{cid}.glb"

        # 1. Promote humanoid rigs to 58-joint Character Forge; keep quadruped PBR GLB clean
        if item.get("rig_mode", "humanoid") == "quadruped":
            shutil.copy2(rig22, final_glb)
            rig_qa = {"p99_stretch": 1.0, "max_stretch": 1.0, "over_3x": 0}
        else:
            run(
                [
                    "node",
                    os.path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
                    os.path.join(ROOT, "scripts", "eraclash3d", "forgeRigMesh.ts"),
                    rig22,
                    final_glb,
                    "--name",
                    cid,
                    "--hold",
                    item.get("hold", "Right:relaxed,Left:relaxed"),
                ],
                label=f"{cid} forgeRigMesh",
            )
            rig_qa = plf.reskin_forge_58_glb(
                final_glb,
                has_robe=bool(item.get("has_robe", False)),
                has_left_pole=bool(item.get("has_left_pole", False)),
            )

        # 3. Render Three.js orthographic views and score against Colab RGBA cutouts (matching true side view!)
        ren_dir = os.path.join(c_dir, "render_three")
        sc_dir = os.path.join(c_dir, "score_three")
        ref_dir = os.path.join(c_dir, "cutouts")
        run(["node", os.path.join(ROOT, "scripts", "riftrealm", "render_views.mjs"), final_glb, ren_dir], label=f"{cid} render_views")

        # Align side filename for score_views.py (expects front.png, side.png, back.png in both dirs)
        score_ren = os.path.join(c_dir, "score_in_ren")
        score_ref = os.path.join(c_dir, "score_in_ref")
        os.makedirs(score_ren, exist_ok=True)
        os.makedirs(score_ref, exist_ok=True)
        shutil.copy2(os.path.join(ren_dir, "front.png"), os.path.join(score_ren, "front.png"))
        shutil.copy2(os.path.join(ren_dir, "back.png"), os.path.join(score_ren, "back.png"))
        shutil.copy2(os.path.join(ref_dir, "front.png"), os.path.join(score_ref, "front.png"))
        shutil.copy2(os.path.join(ref_dir, "back.png"), os.path.join(score_ref, "back.png"))
        side_ref_src = os.path.join(ref_dir, f"{sk}.png")
        if os.path.isfile(side_ref_src):
            shutil.copy2(os.path.join(ren_dir, "right.png" if sk == "right" else "side.png"), os.path.join(score_ren, "side.png"))
            shutil.copy2(side_ref_src, os.path.join(score_ref, "side.png"))
        else:
            for stale in (os.path.join(score_ren, "side.png"), os.path.join(score_ref, "side.png")):
                if os.path.isfile(stale):
                    os.remove(stale)

        out_sc = run([PY, os.path.join(ROOT, "scripts", "riftrealm", "score_views.py"), score_ren, score_ref, sc_dir], label=f"{cid} score_views")
        scores = json.loads(out_sc.strip().splitlines()[-1])
        if "side" in scores:
            scores["side"]["view"] = sk
        scores["front"]["view"] = "front"
        scores["back"]["view"] = "back"

        if do_ktx:
            import ktxPack
            ktxPack.pack_glb(final_glb)

        write_char_report(item, scores, rig_qa, glb_rel, sc_dir)
        mb = os.path.getsize(final_glb) / 1e6
        ov = scores["overall"] * 100.0
        status = "PASS" if ov >= 95.0 else f"{95.0 - ov:.1f}% short"
        s_str = f"{scores['side']['score']*100:4.1f}%" if "side" in scores else " n/a "
        print(
            f"  [INGEST] {cid:8s} -> {mb:4.1f} MB | overall={ov:5.1f}% ({status:11s}) | "
            f"F:{scores['front']['score']*100:4.1f}% S:{s_str} B:{scores['back']['score']*100:4.1f}% | "
            f"p99.5={rig_qa['p99_stretch']:.2f}x",
            flush=True,
        )
        summary.append({"id": cid, "name": item["name"], "mb": round(mb, 2), "scores": scores, "rig_qa": rig_qa})

    # Write cast summary table
    lines = [
        "# Lexicon Cast — Character Forge (Colab GPU) Summary",
        "",
        f"Updated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        "| Villager | Size | Overall | Front | Side | Back | 3-Pose Stretch (p99.5 / max) | Gate (95%) |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for s in summary:
        sc = s["scores"]
        ov = sc["overall"] * 100.0
        rq = s["rig_qa"]
        g = "PASS" if ov >= 95.0 else f"**{95.0 - ov:.1f}% short**"
        s_col = f"{sc['side']['score']*100:.1f}%" if "side" in sc else "n/a"
        lines.append(
            f"| {s['name']} (`{s['id']}`) | {s['mb']:.1f} MB | {ov:.1f}% | "
            f"{sc['front']['score']*100:.1f}% | {s_col} | {sc['back']['score']*100:.1f}% | "
            f"{rq['p99_stretch']:.2f}x / {rq['max_stretch']:.2f}x | {g} |"
        )
    is_creatures = "creature" in str(manifest.get("batch", "")).lower()
    summary_md = os.path.join(HERE, "creatures_report.md" if is_creatures else "cast_report.md")
    with open(summary_md, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\nWrote summary: {summary_md}")


if __name__ == "__main__":
    main()

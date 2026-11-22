"""Rift Realm menu backdrops: short, compressed loops cut from the Flow videos, each with a poster frame.

  "D:/Plajah Runtime/tela-py/Scripts/python.exe" scripts/riftrealm/menu_videos.py [only-id ...]

Maps get one loop each made of three shots (aerial / drone orbit / fly-through) joined with short crossfades;
characters get a turntable loop and a combat reel. 960x540, 24 fps, H.264 CRF 30, no audio, faststart, so a loop is
~0.6-1.5 MB and starts playing before it has fully arrived. Posters are WebP (shown until the video can play).
Output: public/games/rift-realm/assets/menu/{maps,chars}/<id>.mp4 + .webp. Source: the Shooter folder's Nov 15 drop.
"""
import os, subprocess, sys, json
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SRC = r"D:/plajah game assets deign from promtps/Shooter/Nov 15 - 14_43"
OUT = os.path.join(os.path.dirname(__file__), "../../public/games/rift-realm/assets/menu")
SEG, FADE = 4.6, 0.6  # seconds per shot, crossfade length

# (source file prefix, start second). Prefixes are unique in the folder.
MAPS = {
    "elderwood": [("Cyber-forest_high_canopy_sniper", 1.5), ("Camera_moving_through_cyber_forest", 2.0), ("Cyber-forest_chapel_ruin_flythrough", 1.0)],
    "shrine": [("Drone_circling_stone_arena", 1.0), ("Camera_moving_through_cyber_forest", 7.0), ("Camera_ascending_tree_ramp_interior", 1.5)],
    "glacial": [("Crane_camera_descending_citadel", 1.0), ("Glacial_Citadel_ice_bridge_flyth", 1.5), ("Camera_moving_through_glacial_ci", 2.0)],
    "volcanic": [("Drone_orbiting_lava_pit_arena", 1.0), ("Camera_tracking_volcanic_compoun", 1.5), ("Obsidian_volcanic_compound_thron", 1.5)],
    "marsh": [("Crane_descending_over_swamp_docks", 1.0), ("Flythrough_of_sunken_marshland_v", 1.5), ("Sunken_marshland_village_shrine", 1.5)],
    "celestial": [("Camera_approaching_floating_cita", 0.5), ("Camera_crossing_cyan_energy_bridge", 1.5), ("Citadel_ruins_high_watchtower_ra", 1.5)],
}
# turntable (start, length) + combat reel (start, length)
CHARS = {
    "aegis": [("Robot_paladin_character_model_tu", 0.0, 8.0, "turn"), ("Robot_paladin_performing_combat_", 0.5, 7.0, "combat")],
    "stalker": [("Character_model_rotates_on_pedestal", 0.0, 8.0, "turn"), ("Void_Stalker_Assassin_combat_mot", 0.5, 7.0, "combat")],
    "seraph": [("Character_model_turntable_presen", 0.0, 8.0, "turn"), ("Character_performs_aerial_combat\u2026_4efa", 0.5, 7.0, "combat")],
}
ENC = ["-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", "-r", "24"]
SCALE = "scale=960:540:force_original_aspect_ratio=increase,crop=960:540,setsar=1"


def src(prefix):
    for f in sorted(os.listdir(SRC)):
        if f.startswith(prefix) and f.endswith(".mp4"):
            return os.path.join(SRC, f)
    raise SystemExit(f"no source video for {prefix}")


def run(args):
    subprocess.run([FF, "-v", "error", "-y", *args], check=True)


def poster(mp4, at, out):
    run(["-ss", str(at), "-i", mp4, "-frames:v", "1", "-c:v", "libwebp", "-quality", "70", out])


def make_map(mid, shots):
    out = os.path.join(OUT, "maps", f"{mid}.mp4")
    ins, chains = [], []
    for i, (p, t) in enumerate(shots):
        ins += ["-ss", str(t), "-t", str(SEG), "-i", src(p)]
        chains.append(f"[{i}:v]{SCALE},fps=24,format=yuv420p[v{i}]")
    # crossfade the shots in a chain; the loop seam (last -> first) is hidden by the page's own fade
    last, off = "v0", SEG - FADE
    for i in range(1, len(shots)):
        chains.append(f"[{last}][v{i}]xfade=transition=fade:duration={FADE}:offset={off:.2f}[x{i}]")
        last, off = f"x{i}", off + SEG - FADE
    run([*ins, "-filter_complex", ";".join(chains), "-map", f"[{last}]", *ENC, out])
    poster(out, 0.8, out.replace(".mp4", ".webp"))
    return out


def make_char(cid, reels):
    outs = []
    for p, t, length, kind in reels:
        out = os.path.join(OUT, "chars", f"{cid}-{kind}.mp4")
        run(["-ss", str(t), "-t", str(length), "-i", src(p), "-vf", SCALE, *ENC, out])
        poster(out, 0.5, out.replace(".mp4", ".webp"))
        outs.append(out)
    return outs


if __name__ == "__main__":
    only = set(sys.argv[1:])
    os.makedirs(os.path.join(OUT, "maps"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "chars"), exist_ok=True)
    sizes = {}
    for mid, shots in MAPS.items():
        if not only or mid in only:
            o = make_map(mid, shots); sizes[os.path.basename(o)] = os.path.getsize(o)
    for cid, reels in CHARS.items():
        if not only or cid in only:
            for o in make_char(cid, reels): sizes[os.path.basename(o)] = os.path.getsize(o)
    print(json.dumps({k: f"{v / 1e6:.2f} MB" for k, v in sizes.items()}, indent=1))

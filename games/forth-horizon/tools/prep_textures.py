"""Copy the chosen reference textures from the racer asset folder into the game (1024 wide JPEG)."""
import glob, json, os
from PIL import Image

SRC = "D:/plajah game assets deign from promtps/racer/Nov 15 - 14_22"
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "public", "games", "forth-horizon", "tex")
PICK = {
    "asphalt_street": "Asphalt_road_texture_map", "asphalt_highway": "Asphalt_highway_pavement_with_lines", "asphalt_cracked": "Asphalt_texture_map_with_cracks",
    "wet_tarmac": "Wet_black_tarmac_texture", "paver": "Concrete_sidewalk_paver_texture_map", "cobble": "Cobblestone_street_texture_map",
    "kerb": "Motorsport_circuit_kerb_texture", "rumble": "Race_track_rumble_strip_texture", "pit": "Pit_lane_concrete_texture", "grid": "Grand_prix_starting_grid_texture",
    "concrete": "Concrete_slab_texture_map", "gravel": "Coarse_gravel_runoff_track_texture", "dirt": "Dirt_road_texture_map", "sand": "Sand_dune_texture_map",
    "sand_white": "White_sand_dune", "grass": "Green_pasture_grass_texture_map", "forest": "Forest_floor_texture_sheet", "mud": "Damp_mud_ground_texture_map",
    "hay": "Dry_cut_hay_field_texture", "sky_clear": "Clear_blue_sky_texture_map", "sky_golden": "Sky_map_during_golden_hour", "sky_sunset": "Sunset_sky_map_panorama",
    "sky_dusk": "Dusk_skydome_map_with_gradient", "sky_night": "Starry_night_sky_map", "sky_sunrise": "Sunrise_skydome_map_rendering",
}
os.makedirs(OUT, exist_ok=True)
done = {}
for key, prefix in PICK.items():
    m = sorted(glob.glob(os.path.join(SRC, prefix + "*.jpg")))
    ok = None
    for f in m:
        try:
            im = Image.open(f).convert("RGB")
            ok = f
            break
        except Exception:
            continue
    if not ok:
        print("missing", key)
        continue
    w = 1024
    im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, key + ".jpg"), quality=88)
    done[key] = os.path.basename(ok)
json.dump(done, open(os.path.join(OUT, "sources.json"), "w"), indent=1)
print(len(done), "textures")

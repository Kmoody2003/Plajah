import glob, os, subprocess, imageio_ffmpeg
from PIL import Image, ImageDraw
FF = imageio_ffmpeg.get_ffmpeg_exe(); SRC = 'D:/plajah game assets deign from promtps/Shooter/'
names = ['Dragon_exhaling_frost_beam', 'Dragon_unleashing_laser_roar', 'Sorceress_performing_magic', 'Prism_Archon_performing',
         'Pyre_Knight_Berserker_combat', 'Creature_performing_electrical', 'Rhino_charging_through', 'Titan_battling_warrior',
         'Demon_performing_combat_sequence', 'Camera_crossing_cyan_energy', 'Volcanic_compound_armory', 'Bioluminescent_wasp_attacking',
         'Sloth_creature_climbing', 'Glowing_cyber_forest_mushrooms', 'Cyber-melee_sound_design', 'Assassin_performing_shadow']
vids = []
for n in names:
    m = glob.glob(SRC + '*/' + n + '*.mp4'); vids.append(m[0])
os.makedirs('D:/plajah-tmp/rift-sfx/sheets', exist_ok=True)
W, H, F = 256, 144, 5
for s in range(4):
    sheet = Image.new('RGB', (W * F, (H + 16) * 4), (10, 10, 10)); d = ImageDraw.Draw(sheet)
    for r, v in enumerate(vids[s * 4:(s + 1) * 4]):
        dur = 10.0 if 'Nov 15' in v else 15.0
        for k in range(F):
            t = 0.6 + k * (dur - 1.2) / (F - 1)
            p = f'D:/plajah-tmp/rift-sfx/sheets/f.jpg'
            subprocess.run([FF, '-y', '-v', 'error', '-ss', f'{t:.2f}', '-i', v, '-frames:v', '1', '-vf', f'scale={W}:{H}', p])
            sheet.paste(Image.open(p), (k * W, r * (H + 16) + 16))
        d.text((4, r * (H + 16) + 2), os.path.basename(v)[:60], fill=(230, 230, 230))
    sheet.save(f'D:/plajah-tmp/rift-sfx/sheets/sheet{s}.jpg', quality=85)
print('ok')

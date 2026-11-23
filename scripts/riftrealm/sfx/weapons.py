"""Per-weapon SFX for Rift Realm (src/weapons.ts): reload parts, dry fire, switch and impacts, cut from the Flow-video
clip library (D:/plajah-tmp/rift-sfx/clips, see docs/rift-realm-fx-study.md). Reload parts come from the same mocap
videos as the body's reload clips, so they line up with the animation. Writes mono mp3s to the game's sfx folder.
Run: "D:/Plajah Runtime/tela-py/Scripts/python.exe" -I scripts/riftrealm/sfx/weapons.py
"""
import os, subprocess, tempfile, numpy as np, soundfile as sf, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
SRC = 'D:/plajah-tmp/rift-sfx/clips/'
OUT = os.path.join(os.path.dirname(__file__), '../../../public/games/rift-realm/assets/audio/sfx/')
# name -> (clip, max seconds, peak dBFS)
PICKS = {
    'magout_r_1': ('reload/Soldier_reloading_assault_rifle_01', 0.55, -3),
    'magin_r_1': ('reload/Soldier_reloading_assault_rifle_03', 0.45, -2),
    'charge_r_1': ('reload/Soldier_reloading_assault_rifle_04', 0.6, -2),
    'magout_p_1': ('reload/Soldier_reloading_pistol_in_studio_02', 0.3, -3),
    'magin_p_1': ('reload/Soldier_reloading_pistol_in_studio_03', 0.35, -2),
    'charge_p_1': ('reload/Soldier_reloading_pistol_in_studio_05', 0.3, -2),
    'dry_1': ('reload/Soldier_reloading_pistol_in_studio_04', 0.2, -4),
    'dry_2': ('reload/Soldier_reloading_pistol_in_studio_01', 0.2, -4),
    'switch_1': ('reload/Soldier_switching_from_rifle_pistol_02', 0.5, -4),
    'switch_2': ('reload/Soldier_switching_from_rifle_pistol_05', 0.5, -4),
    'imp_lance_1': ('impact/Dragon_unleashing_laser_roar_at_03', 0.25, -3),
    'imp_lance_2': ('impact/Rhino_charging_through_holograph_00', 0.4, -3),
    'imp_scatter_1': ('impact/Demon_performing_heavy_combat_an_10', 0.26, -3),
    'imp_scatter_2': ('impact/Demon_performing_heavy_combat_an_09', 0.24, -3),
    'imp_chord_1': ('metal/Assassin_performing_high-agility_07', 0.26, -4),
    'imp_chord_2': ('metal/Cyber-Assassin_performing_combat_03', 0.45, -4),
}

def load(path):
    tmp = tempfile.mktemp(suffix='.wav')
    subprocess.run([FF, '-y', '-v', 'error', '-i', path, '-ac', '1', '-ar', '48000', tmp], check=True)
    a, sr = sf.read(tmp); os.remove(tmp); return a, sr

if __name__ == '__main__':
    for name, (clip, maxs, peak) in PICKS.items():
        a, sr = load(SRC + clip + '.mp3')
        # start at the first transient (10 % of peak), keep maxs, short fade in, cosine fade over the last 35 %
        on = int(np.argmax(np.abs(a) > 0.1 * np.abs(a).max()))
        a = a[max(0, on - int(0.004 * sr)): max(0, on - int(0.004 * sr)) + int(maxs * sr)].copy()
        n = len(a); fi = int(0.003 * sr); fo = int(n * 0.35)
        a[:fi] *= np.linspace(0, 1, fi)
        a[-fo:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))
        a *= 10 ** (peak / 20) / max(1e-6, np.abs(a).max())
        tmp = tempfile.mktemp(suffix='.wav'); sf.write(tmp, a, sr)
        subprocess.run([FF, '-y', '-v', 'error', '-i', tmp, '-ac', '1', '-b:a', '128k', OUT + name + '.mp3'], check=True)
        os.remove(tmp); print(name, f'{n / sr:.2f}s', clip)

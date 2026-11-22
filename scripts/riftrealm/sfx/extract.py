"""Pull the audio out of every Rift Realm video in the Shooter folder (48 kHz stereo wav) and note duration/loudness."""
import json, os, subprocess, sys, glob
import numpy as np, soundfile as sf, imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
SRC = 'D:/plajah game assets deign from promtps/Shooter'
OUT = 'D:/plajah-tmp/rift-sfx/wav/'
vids = sorted(glob.glob(SRC + '/Nov 15 - 14_43/*.mp4') + glob.glob(SRC + '/Cyber Forest Level Assets/*.mp4') + glob.glob(SRC + '/motion capture body/*.mp4'))
info = {}
for v in vids:
    slug = os.path.splitext(os.path.basename(v))[0].replace('\u2026', '').replace(' ', '_')
    w = OUT + slug + '.wav'
    if not os.path.exists(w):
        r = subprocess.run([FF, '-y', '-v', 'error', '-i', v, '-vn', '-ac', '2', '-ar', '48000', w], capture_output=True)
        if r.returncode != 0 or not os.path.exists(w):
            info[slug] = {'src': v, 'audio': False}; continue
    x, sr = sf.read(w, always_2d=True)
    m = x.mean(1)
    rms = float(np.sqrt((m ** 2).mean()) + 1e-12)
    info[slug] = {'src': v, 'audio': rms > 1e-4, 'dur': round(len(m) / sr, 2), 'rmsDb': round(20 * np.log10(rms), 1), 'peakDb': round(20 * np.log10(np.abs(m).max() + 1e-12), 1),
                  'folder': os.path.basename(os.path.dirname(v))}
json.dump(info, open('D:/plajah-tmp/rift-sfx/info.json', 'w'), indent=1)
print(len(vids), 'videos;', sum(1 for i in info.values() if i.get('audio')), 'with audio')
for k, i in info.items():
    if i.get('audio'): print(f"{i['folder'][:10]:10} {k[:60]:60} {i['dur']:5}s rms {i['rmsDb']} dB")

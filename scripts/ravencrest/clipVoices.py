"""Clip the Pumpkin Patch cast's lines from Brian James Gage's film (the platform's own Mux stream) for
Ravencrest's "comes into frame" voice barks. Timecodes come from the Council V4 comic's balloon panels
(data/showcase/comics/pumpkinPatchV4.ts); only short single-speaker windows are used, faded and loudness-
normalised. Writes public/games/ravencrest/audio/voices/*.mp3 + voices.json.

  python scripts/ravencrest/clipVoices.py
"""
import json
import os
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FF = r'D:\ComfyUI_windows_portable\ComfyUI_windows_portable\python_embeded\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win64-v4.2.2.exe'
SRC = 'https://stream.mux.com/D1A4FF6AJXRbfbPjzvzQCkj5srRk99uXpnDn00gTKDts/medium.mp4'
OUT = os.path.join(ROOT, 'public', 'games', 'ravencrest', 'audio', 'voices')

# id, character (mob kind), t0, t1, line (as captioned)
# Times from scripts/ravencrest/retimeVoices.py (word-matched in the film audio, 2026-10-23); lines it
# couldn't find cleanly (melvin_name, crane_monkeys, crane_assault) are dropped.
LINES = [
    ('melvin_victory', 'pumpkin', 727.23, 733.65, "Sorry Penny, they started it. I did not scratch. Come on, little Boo, let's go."),
    ('melvin_trick', 'pumpkin', 2891.01, 2892.95, "How's this trick?"),
    ('melvin_all_the_way', 'pumpkin', 2532.77, 2535.99, 'We take this all the way. Almost there.'),
    ('melvin_lock', 'pumpkin', 2400.93, 2405.19, 'Close enough. I got a lock on the Hexagon beacon.'),
    ('miriam_darling', 'miriam', 3092.11, 3096.33, 'Hello, darling. Might we have a word?'),
    ('miriam_horseman', 'miriam', 2288.25, 2294.29, "Come out wherever you are, horseman. I sense you're near."),
    ('miriam_impossible', 'miriam', 951.49, 954.17, 'Impossible. Pipe it through.'),
    ('stitch_gorgeous', 'stitch', 985.72, 993.35, "Well, hello there, gorgeous. Remember me? It's been a while."),
    ('stitch_planet', 'stitch', 2864.67, 2871.55, "I know. Where I'm going, I don't need this planet."),
    ('crane_name', 'robobones', 2841.61, 2846.61, "The name's Commander Crane. Never did like that guy."),
    ('crane_terminated', 'robobones', 3117.84, 3124.00, "You're interfering with the MIA operation, further resistance will be terminated."),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for vid, who, t0, t1, text in LINES:
        dur = t1 - t0 + 0.5
        path = os.path.join(OUT, f'{vid}.mp3')
        subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{t0 - 0.25:.2f}', '-t', f'{dur:.2f}', '-i', SRC,
                        '-vn', '-ac', '1', '-ar', '44100',
                        '-af', f'afade=t=in:d=0.08,afade=t=out:st={dur - 0.3:.2f}:d=0.3,loudnorm=I=-16:TP=-1.5',
                        '-b:a', '112k', path], check=True, timeout=180)
        manifest.append({'id': vid, 'kind': who, 'text': text, 'url': f'/games/ravencrest/audio/voices/{vid}.mp3', 'source': {'film': 'Pumpkin Patch (Brian James Gage, 2025)', 't0': t0, 't1': t1}})
        print(vid, os.path.getsize(path), flush=True)
    json.dump({'voices': manifest}, open(os.path.join(OUT, 'voices.json'), 'w', encoding='utf8'), indent=1)


if __name__ == '__main__':
    main()

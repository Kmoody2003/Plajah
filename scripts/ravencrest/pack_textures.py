"""Pack Poly Haven AO / roughness / displacement into one RGB texture per set ("ard.jpg").

Triplanar shading samples every map three times; packing three greyscale maps into one
cuts per-pixel texture fetches from 15 to 6 (diffuse + ARD), which matters on iGPUs.

Usage: python scripts/ravencrest/pack_textures.py   (after fetchPolyhaven.mjs)
"""
import pathlib
from PIL import Image

ROOT = pathlib.Path('public/games/ravencrest/assets/polyhaven/textures')

for d in sorted(p for p in ROOT.iterdir() if p.is_dir()):
    out = d / 'ard.jpg'
    if out.exists():
        continue
    maps = []
    for name in ('ao', 'rough', 'disp'):
        f = next(iter(d.glob(f'{name}.*')), None)
        maps.append(Image.open(f).convert('L') if f else None)
    size = next((m.size for m in maps if m), (1024, 1024))
    chans = [(m.resize(size) if m else Image.new('L', size, 255 if i == 0 else 128)) for i, m in enumerate(maps)]
    Image.merge('RGB', chans).save(out, quality=92)
    print('packed', d.name, size)

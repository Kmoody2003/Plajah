import json
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(r'C:\Users\Kenne\.gemini\antigravity\brain\42e3bfd8-faf9-4bbd-85bf-ae0b60e1bbba\scratch\qa')
meta = json.loads((OUT / 'last_shots.json').read_text(encoding='utf-8'))
car_ids = meta['carIds']
views = ['front34', 'side', 'rear34', 'front']
tw, th = 480, 280
canvas = Image.new('RGB', (len(views) * tw, len(car_ids) * th), (16, 18, 22))
draw = ImageDraw.Draw(canvas)

for r, cid in enumerate(car_ids):
    for c, v in enumerate(views):
        p = OUT / f'{cid}_{v}.png'
        if not p.exists():
            continue
        im = Image.open(p).convert('RGB').resize((tw, th), Image.Resampling.LANCZOS)
        canvas.paste(im, (c * tw, r * th))
        draw.rectangle([c * tw + 6, r * th + 6, c * tw + 180, r * th + 28], fill=(10, 12, 16))
        draw.text((c * tw + 12, r * th + 10), f'{cid} · {v}', fill=(250, 225, 140))

dest = OUT / meta['outName']
canvas.save(dest)
print('STITCHED:', dest)

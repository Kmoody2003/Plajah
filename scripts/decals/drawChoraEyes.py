"""drawChoraEyes — procedural eye-decal atlas for Chora (crisp vector-style marks; no AI art needed).

    python scripts/decals/drawChoraEyes.py docs/kaiju-fidelity/magnific/decals/atlas/chora_eyes

Chora's eyes are simple glossy black marks on a purple patch (the patch itself is painted on the 3D mesh), so
they are drawn here with PIL at 4x supersampling and written in the same atlas format as buildFaceAtlas.py
(<prefix>_L.png/.json for the character's left eye, <prefix>_R.png/.json mirrored for the right).
"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFilter

CELL, SS = 384, 4
COLS, ROWS = 3, 4
NAMES = ['open', 'half', 'closed', 'wide', 'squint', 'happy', 'sad', 'heart', 'star', 'look_up_left', 'spiral', 'sleepy']
INK = (14, 10, 22, 255)


def canvas():
    return Image.new('RGBA', (CELL * SS, CELL * SS), (0, 0, 0, 0))


def oval(d, cx, cy, rx, ry, fill):
    d.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], fill=fill)


def highlight(d, cx, cy, r):
    oval(d, cx, cy, r, r, (255, 255, 255, 255)); oval(d, cx + r * 0.9, cy + r * 1.1, r * 0.4, r * 0.4, (255, 255, 255, 190))


def stroke(d, pts, w, fill=INK):
    d.line([(x * SS, y * SS) for x, y in pts], fill=fill, width=int(w * SS), joint='curve')
    for x, y in (pts[0], pts[-1]):
        oval(d, x, y, w / 2, w / 2, fill)


def arc(cx, cy, rx, ry, a0, a1, n=40):
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def heart(d, cx, cy, s, fill=(232, 38, 70, 255)):
    pts = []
    for i in range(121):
        t = i / 120 * 2 * math.pi
        pts.append((cx + s * 16 * math.sin(t) ** 3 / 17 * 1.0, cy - s * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 17))
    d.polygon([(x * SS, y * SS) for x, y in pts], fill=fill)
    oval(d, cx - s * 0.42, cy - s * 0.4, s * 0.16, s * 0.1, (255, 255, 255, 200))


def star(d, cx, cy, s, fill=(255, 255, 255, 255)):
    pts = []
    for i in range(8):
        r = s if i % 2 == 0 else s * 0.28
        a = math.radians(-90 + i * 45)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon([(x * SS, y * SS) for x, y in pts], fill=fill)


def draw_state(name):
    im = canvas(); d = ImageDraw.Draw(im); c = CELL / 2
    if name == 'open':
        oval(d, c, c, 74, 86, INK); highlight(d, c - 22, c - 34, 15)
    elif name == 'half':
        oval(d, c, c + 10, 74, 76, INK); highlight(d, c - 22, c - 12, 12)
        d.rectangle([(c - 96) * SS, (c - 90) * SS, (c + 96) * SS, (c - 26) * SS], fill=(0, 0, 0, 0))
        stroke(d, [(c - 88, c - 26), (c + 88, c - 26)], 18)
    elif name == 'closed':
        stroke(d, arc(c, c - 30, 88, 46, 25, 155), 18)
    elif name == 'wide':
        oval(d, c, c, 100, 108, (250, 250, 252, 255)); oval(d, c, c, 100, 108, (250, 250, 252, 255))
        oval(d, c + 4, c + 6, 52, 58, INK); highlight(d, c - 14, c - 18, 16)
        d.arc([(c - 100) * SS, (c - 108) * SS, (c + 100) * SS, (c + 108) * SS], 0, 360, fill=(210, 206, 220, 255), width=SS * 4)
    elif name == 'squint':
        stroke(d, [(c - 62, c - 62), (c + 54, c), (c - 62, c + 62)], 22)
    elif name == 'happy':
        stroke(d, arc(c, c + 38, 76, 78, 200, 340), 22)
    elif name == 'sad':
        oval(d, c, c + 6, 70, 80, INK); highlight(d, c - 20, c - 22, 14)
        stroke(d, [(c - 96, c - 86), (c + 40, c - 46)], 14)
        oval(d, c + 6, c + 100, 12, 18, (150, 210, 245, 255))
    elif name == 'heart':
        heart(d, c, c + 6, 128)
    elif name == 'star':
        star(d, c, c, 106)
    elif name == 'look_up_left':
        oval(d, c, c, 94, 100, (250, 250, 252, 255)); oval(d, c - 40, c - 44, 48, 52, INK); highlight(d, c - 56, c - 62, 13)
        d.arc([(c - 94) * SS, (c - 100) * SS, (c + 94) * SS, (c + 100) * SS], 0, 360, fill=(210, 206, 220, 255), width=SS * 4)
    elif name == 'spiral':
        pts = [(c + (6 + i * 0.95) * math.cos(i * 0.28), c + (6 + i * 0.95) * math.sin(i * 0.28)) for i in range(0, 190)]
        stroke(d, pts, 12)
    elif name == 'sleepy':
        oval(d, c, c + 24, 74, 52, INK); highlight(d, c - 22, c + 8, 10)
        d.rectangle([(c - 96) * SS, (c - 70) * SS, (c + 96) * SS, (c - 2) * SS], fill=(0, 0, 0, 0))
        stroke(d, [(c - 90, c - 2), (c + 90, c - 2)], 18)
    return im.resize((CELL, CELL), Image.LANCZOS)


def main(prefix):
    for side in ('L', 'R'):
        atlas = Image.new('RGBA', (COLS * CELL, ROWS * CELL), (0, 0, 0, 0)); states = []
        for i, n in enumerate(NAMES):
            r, c = divmod(i, COLS); tile = draw_state(n)
            if side == 'R':
                tile = tile.transpose(Image.FLIP_LEFT_RIGHT)
            atlas.paste(tile, (c * CELL, r * CELL))
            bbox = tile.getbbox() or (0, 0, 1, 1)
            states.append({'name': n, 'col': c, 'row': r, 'anchor': [0.5, 0.5], 'size': [round((bbox[2] - bbox[0]) / CELL, 4), round((bbox[3] - bbox[1]) / CELL, 4)]})
        os.makedirs(os.path.dirname(prefix) or '.', exist_ok=True)
        atlas.save(f'{prefix}_{side}.png')
        json.dump({'cols': COLS, 'rows': ROWS, 'cell': CELL, 'source': 'procedural', 'side': side, 'states': states}, open(f'{prefix}_{side}.json', 'w'), indent=1)
        bg = Image.new('RGBA', atlas.size, (236, 232, 244, 255)); bg.alpha_composite(atlas)
        bg.convert('RGB').resize((atlas.width // 2, atlas.height // 2), Image.LANCZOS).save(f'{prefix}_{side}_preview.jpg', quality=90)
    print('wrote', prefix)


if __name__ == '__main__':
    main(sys.argv[1])

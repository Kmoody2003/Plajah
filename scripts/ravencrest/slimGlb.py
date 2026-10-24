"""Shrink the textures embedded in Ravencrest's runtime GLBs (load time is mostly texture bytes).

    python scripts/ravencrest/slimGlb.py [--dry] <file.glb>...

Opaque images become JPEG (4:4:4, so the packed metal/roughness channels and normals keep their
detail; normals at q92, the rest at q88). Images with real alpha stay PNG. Colour maps are capped at
2048 px; normal/roughness/occlusion maps at 1024 except on the two heroes, who are always close to
camera; vehicles and kraken arms at 1024 throughout. A file that would not shrink is left alone. Geometry, skins and animations are copied byte for byte;
only the image buffer views change. The first run copies each original to
games/ravencrest/assets-src/fullres/<path under assets/> (git-ignored), and later runs re-encode
from that copy, so running it twice never compounds the loss.
"""
import io, json, os, shutil, struct, sys
from PIL import Image, ImageFile

ImageFile.MAXBLOCK = 1 << 26   # optimize=True needs the whole JPEG in one block ("Suspension not allowed here")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(ROOT, 'public', 'games', 'ravencrest', 'assets')
FULLRES = os.path.join(ROOT, 'games', 'ravencrest', 'assets-src', 'fullres')


def read_glb(b):
    magic, ver, total = struct.unpack('<4sII', b[:12])
    assert magic == b'glTF' and ver == 2
    jl, jt = struct.unpack('<I4s', b[12:20])
    j = json.loads(b[20:20 + jl])
    o = 20 + jl
    bin_ = b''
    if o < len(b):
        bl, bt = struct.unpack('<I4s', b[o:o + 8])
        assert bt == b'BIN\x00'
        bin_ = b[o + 8:o + 8 + bl]
    return j, bin_


def write_glb(j, bin_):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    bin_ += b'\x00' * (-len(bin_) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    return struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(bin_), b'BIN\x00') + bin_


def roles(j):
    """image index -> set of material slots that sample it."""
    out = {}
    for m in j.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        for slot, t in (('base', pbr.get('baseColorTexture')), ('mr', pbr.get('metallicRoughnessTexture')),
                        ('nrm', m.get('normalTexture')), ('emi', m.get('emissiveTexture')), ('occ', m.get('occlusionTexture'))):
            if t is None:
                continue
            src = j['textures'][t['index']].get('source')
            if src is not None:
                out.setdefault(src, set()).add(slot)
    return out


HEROES = ('characters/elise.glb', 'characters/jack_thorne.glb')


def encode(data, cap, slots):
    im = Image.open(io.BytesIO(data))
    im.load()
    alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
    if alpha:
        im = im.convert('RGBA')
        if im.getchannel('A').getextrema()[0] == 255:
            alpha = False
    if max(im.size) > cap:
        s = cap / max(im.size)
        im = im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)
    buf = io.BytesIO()
    if alpha:
        im.save(buf, 'PNG', optimize=True)
        return buf.getvalue(), 'image/png'
    im.convert('RGB').save(buf, 'JPEG', quality=92 if 'nrm' in slots else 88, subsampling=0, optimize=True)
    return buf.getvalue(), 'image/jpeg'


def slim(path, dry=False):
    rel = os.path.relpath(os.path.abspath(path), ASSETS)
    assert not rel.startswith('..'), f'{path} is not under {ASSETS}'
    backup = os.path.join(FULLRES, rel)
    src = backup if os.path.exists(backup) else path
    b = open(src, 'rb').read()
    j, bin_ = read_glb(b)
    r = rel.replace('\\', '/')
    cap = 1024 if r.startswith(('vehicles/', 'creatures/bases/kraken')) else 2048
    detail_cap = cap if r in HEROES else 1024
    imgs = j.get('images', [])
    rl = roles(j)
    views = j.get('bufferViews', [])
    new_data = {}
    for k, im in enumerate(imgs):
        if 'bufferView' not in im:
            continue
        v = views[im['bufferView']]
        o = v.get('byteOffset', 0)
        slots = rl.get(k, set())
        data, mime = encode(bin_[o:o + v['byteLength']], cap if slots & {'base', 'emi'} or not slots else detail_cap, slots)
        new_data[im['bufferView']] = data
        im['mimeType'] = mime
    # Repack every view in order (4-byte aligned); accessor offsets are view-relative, so they hold.
    out = bytearray()
    for vi, v in enumerate(views):
        o = v.get('byteOffset', 0)
        data = new_data.get(vi, bin_[o:o + v['byteLength']])
        out += b'\x00' * (-len(out) % 4)
        v['byteOffset'] = len(out)
        v['byteLength'] = len(data)
        out += data
    if j.get('buffers'):
        j['buffers'][0]['byteLength'] = len(out)
    res = write_glb(j, bytes(out))
    before = os.path.getsize(path)
    print(f'{rel:48s} {before / 1e6:6.1f} MB -> {len(res) / 1e6:5.1f} MB')
    if dry or len(res) >= before:
        return
    if not os.path.exists(backup):
        os.makedirs(os.path.dirname(backup), exist_ok=True)
        shutil.copy2(path, backup)
    open(path, 'wb').write(res)


if __name__ == '__main__':
    args = sys.argv[1:]
    dry = '--dry' in args
    for p in [a for a in args if a != '--dry']:
        slim(p, dry)

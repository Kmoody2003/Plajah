"""Rift Realm GPU texture packaging (KTX2 / Basis Universal), same recipe as Ravencrest (scripts/ravencrest/ktxGlb.py).

    python scripts/riftrealm/ktxPack.py            # characters + PBR sets
    python scripts/riftrealm/ktxPack.py chars      # only the character GLBs
    python scripts/riftrealm/ktxPack.py pbr        # only the split PBR sets

Characters: public/games/rift-realm/assets/characters/<id>.glb -> characters/gpu/<id>.glb (KHR_texture_basisu; the
EXT_texture_webp sources are re-encoded). They are heroes (always close to the camera): colour + normals in UASTC.
PBR sets: assets/pbr/<set>/<map>.jpg -> <map>.ktx2 beside it (colour ETC1S sRGB, normals UASTC, data maps ETC1S linear).
The game loads these through KTX2Loader (games/rift-realm/src/textures.ts, characters.ts) and falls back to the jpg/glb.
Needs KTX-Software's `ktx` (KTX_BIN, default D:/Plajah Runtime/ktx/bin/ktx.exe).
"""
import glob, os, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'ravencrest'))
from slimGlb import read_glb, write_glb, roles  # noqa: E402
from ktxGlb import encode, KTX  # noqa: E402

ASSETS = os.path.join(ROOT, 'public', 'games', 'rift-realm', 'assets')


def pack_glb(path):
    j, bin_ = read_glb(open(path, 'rb').read())
    rl, views = roles(j), j.get('bufferViews', [])
    # webp sources live under EXT_texture_webp; give roles() a plain view of them first
    for t in j.get('textures', []):
        ext = t.get('extensions', {})
        if 'EXT_texture_webp' in ext:
            t['source'] = ext.pop('EXT_texture_webp')['source']
            if not ext:
                t.pop('extensions')
    rl = roles(j)
    jobs = {}
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(3) as pool:
        for k, im in enumerate(j.get('images', [])):
            if 'bufferView' not in im:
                continue
            v = views[im['bufferView']]
            o = v.get('byteOffset', 0)
            jobs[im['bufferView']] = (k, pool.submit(encode, bin_[o:o + v['byteLength']], rl.get(k, set()), 2048, True, tmp, k))
        new_data = {vi: f.result() for vi, (k, f) in jobs.items()}
    for vi, (k, _) in jobs.items():
        j['images'][k]['mimeType'] = 'image/ktx2'
    for t in j.get('textures', []):
        if 'source' in t:
            t.setdefault('extensions', {})['KHR_texture_basisu'] = {'source': t.pop('source')}
    for key in ('extensionsUsed', 'extensionsRequired'):
        s = set(j.get(key, [])) - {'EXT_texture_webp'}
        j[key] = sorted(s | {'KHR_texture_basisu'})
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
    dst = os.path.join(os.path.dirname(path), 'gpu', os.path.basename(path))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + '.tmp'
    with open(tmp, 'wb') as f:
        f.write(res)
    os.replace(tmp, dst)
    print(f'{os.path.basename(path):24s} {os.path.getsize(path) / 1e6:5.1f} MB -> {len(res) / 1e6:5.1f} MB', flush=True)


def pack_map(jpg):
    name = os.path.splitext(os.path.basename(jpg))[0]
    out = jpg[:-4] + '.ktx2'
    colour = name in ('albedo', 'emissive')
    args = [KTX, 'create', '--format', 'R8G8B8_SRGB' if colour else 'R8G8B8_UNORM', '--assign-tf', 'srgb' if colour else 'linear', '--generate-mipmap']
    if name == 'normal':
        args += ['--encode', 'uastc', '--uastc-quality', '1', '--uastc-rdo', '--uastc-rdo-l', '1.5', '--zstd', '19']
    else:
        args += ['--encode', 'basis-lz', '--clevel', '2', '--qlevel', '255' if colour else '200']
    with tempfile.TemporaryDirectory() as tmp:
        from PIL import Image
        png = os.path.join(tmp, 'src.png')
        # pre-flipped: KTX2 textures upload with flipY=false, the jpgs with flipY=true - this keeps UVs + normal maps identical
        Image.open(jpg).convert('RGB').transpose(Image.FLIP_TOP_BOTTOM).save(png)
        subprocess.run(args + [png, out], check=True, capture_output=True)
    return out


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('all', 'chars'):
        for g in sorted(glob.glob(os.path.join(ASSETS, 'characters', '*.glb'))):
            pack_glb(g)
    if what in ('all', 'pbr'):
        maps = sorted(glob.glob(os.path.join(ASSETS, 'pbr', '*', '*.jpg')))
        with ThreadPoolExecutor(4) as pool:
            for o in pool.map(pack_map, maps):
                pass
        import json
        man = {}
        for m in maps:
            man.setdefault(os.path.basename(os.path.dirname(m)), []).append(os.path.splitext(os.path.basename(m))[0])
        json.dump(man, open(os.path.join(ASSETS, 'pbr', 'manifest.json'), 'w'), indent=1)
        jt = sum(os.path.getsize(m) for m in maps) / 1e6
        kt = sum(os.path.getsize(m[:-4] + '.ktx2') for m in maps) / 1e6
        print(f'PBR: {len(maps)} maps, {jt:.1f} MB jpg -> {kt:.1f} MB ktx2 (GPU memory ~4-6x smaller)')

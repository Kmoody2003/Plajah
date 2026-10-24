"""Package Ravencrest's runtime GLBs with GPU-compressed KTX2 textures (KHR_texture_basisu).

    python scripts/ravencrest/ktxGlb.py [--dry] <file.glb>...

JPEG/PNG textures are decoded to full RGBA on upload: a 2048 px map costs ~22 MB of video memory with
mipmaps. Basis Universal KTX2 stays block-compressed on the GPU (BC7/BC1 on desktop, ASTC/ETC on phones),
about 4-6x less video memory and a quick transcode instead of a JPEG decode. Per material slot:
  colour   ETC1S (BasisLZ, q255) at 2048; the two heroes get UASTC (higher fidelity, always close up)
  normals  UASTC + RDO + Zstandard, 1024 except the heroes (2048)
  rough/metal/AO  ETC1S (linear) at 1024 except the heroes
Writes public/games/ravencrest/assets/gpu/<path under assets/>: the originals stay as they are for the
rest of Plajah (Story Intel loads some of them without a KTX2 decoder); only the game reads gpu/.
Encodes from the full-resolution originals in games/ravencrest/assets-src/fullres/ (slimGlb.py made
them) when present. Needs KTX-Software's `ktx` (KTX_BIN, default D:/Plajah Runtime/ktx/bin/ktx.exe).
The game loads these through KTX2Loader (games/ravencrest/src/ktx2.ts).
"""
import io, os, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from slimGlb import read_glb, write_glb, roles, ASSETS, FULLRES, HEROES  # noqa: E402

KTX = os.environ.get('KTX_BIN', r'D:\Plajah Runtime\ktx\bin\ktx.exe')


def encode(data, slots, cap, hero, tmp, idx):
    im = Image.open(io.BytesIO(data))
    im.load()
    alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
    im = im.convert('RGBA' if alpha else 'RGB')
    if alpha and im.getchannel('A').getextrema()[0] == 255:
        alpha, im = False, im.convert('RGB')
    if max(im.size) > cap:
        s = cap / max(im.size)
        im = im.resize((max(4, round(im.size[0] * s)), max(4, round(im.size[1] * s))), Image.LANCZOS)
    src = os.path.join(tmp, f'{idx}.png')
    out = os.path.join(tmp, f'{idx}.ktx2')
    im.save(src)
    colour = bool(slots & {'base', 'emi'}) or not slots
    fmt = ('R8G8B8A8' if alpha else 'R8G8B8') + ('_SRGB' if colour else '_UNORM')
    args = [KTX, 'create', '--format', fmt, '--assign-tf', 'srgb' if colour else 'linear', '--generate-mipmap']
    if 'nrm' in slots or (colour and hero):
        args += ['--encode', 'uastc', '--uastc-quality', '1', '--uastc-rdo', '--uastc-rdo-l', '2', '--zstd', '19']
    else:
        args += ['--encode', 'basis-lz', '--clevel', '2', '--qlevel', '255' if colour else '220']
    subprocess.run(args + [src, out], check=True, capture_output=True)
    return open(out, 'rb').read()


def package(path, dry=False):
    rel = os.path.relpath(os.path.abspath(path), ASSETS)
    r = rel.replace('\\', '/')
    backup = os.path.join(FULLRES, rel)
    j, bin_ = read_glb(open(backup if os.path.exists(backup) else path, 'rb').read())
    if 'KHR_texture_basisu' in j.get('extensionsUsed', []):
        print(f'{r}: already KTX2'); return
    hero = r in HEROES
    cap = 1024 if r.startswith(('vehicles/', 'creatures/bases/kraken')) else 2048
    detail = cap if hero else 1024
    rl = roles(j)
    views = j.get('bufferViews', [])
    jobs = {}
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(3) as pool:
        for k, im in enumerate(j.get('images', [])):
            if 'bufferView' not in im:
                continue
            v = views[im['bufferView']]
            o = v.get('byteOffset', 0)
            slots = rl.get(k, set())
            c = cap if (slots & {'base', 'emi'} or not slots) else detail
            jobs[im['bufferView']] = (k, pool.submit(encode, bin_[o:o + v['byteLength']], slots, c, hero, tmp, k))
        new_data = {vi: f.result() for vi, (k, f) in jobs.items()}
    for vi, (k, _) in jobs.items():
        j['images'][k]['mimeType'] = 'image/ktx2'
    for t in j.get('textures', []):
        if 'source' in t:
            t.setdefault('extensions', {})['KHR_texture_basisu'] = {'source': t.pop('source')}
    for key in ('extensionsUsed', 'extensionsRequired'):
        j[key] = sorted(set(j.get(key, [])) | {'KHR_texture_basisu'})
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
    print(f'{r:48s} {os.path.getsize(path) / 1e6:6.1f} MB -> {len(res) / 1e6:5.1f} MB', flush=True)
    if dry:
        return
    dst = os.path.join(ASSETS, 'gpu', rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, 'wb').write(res)


if __name__ == '__main__':
    args = sys.argv[1:]
    for p in [a for a in args if a != '--dry']:
        package(p, '--dry' in args)

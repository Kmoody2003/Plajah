"""KTX2-package the Poly Haven assets Ravencrest streams in browsers (see ktxGlb.py for why).

    python scripts/ravencrest/ktxPolyhaven.py

Tiling surfaces: textures/<id>/{diff,nor_gl,ard}_1k.jpg -> .ktx2 beside them. Colour is ETC1S; the
normal and the packed AO/rough/height map are UASTC with strong RDO (height drives the bump, and ETC1S
block noise in it reads as grain). Props: colour and metal/rough/AO ETC1S, normals UASTC. Props: every models/<id>/<id>_*.gltf gets a twin <id>_*.ktx2.gltf whose images
are .ktx2 files beside the JPEGs (KHR_texture_basisu), same slot rules as the cast. The JPEGs and
original .gltf files stay: the game falls back to them (materials.ts, assets.ts).
Surfaces are stored flipped (they load with flipY like the JPEGs); glTF images are not.
Skips anything already converted unless --force.
"""
import io, json, os, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ktxGlb import encode  # noqa: E402
from slimGlb import ASSETS, roles  # noqa: E402

PH = os.path.join(ASSETS, 'polyhaven')
FORCE = '--force' in sys.argv


def to_ktx(src, dst, slots, tmp, tag, flip):
    if os.path.exists(dst) and not FORCE:
        return 0
    raw = open(src, 'rb').read()
    if flip:
        # Surfaces load through TextureLoader (flipY on); a KTX2 uploads as stored, so store it flipped.
        b = io.BytesIO(); Image.open(io.BytesIO(raw)).transpose(Image.FLIP_TOP_BOTTOM).save(b, 'PNG'); raw = b.getvalue()
    data = encode(raw, slots, 4096, False, tmp, tag, rdo='4')   # stronger RDO: these stream on every load
    open(dst, 'wb').write(data)
    print(f'{os.path.relpath(dst, PH):70s} {os.path.getsize(src) / 1e6:5.2f} -> {len(data) / 1e6:5.2f} MB', flush=True)
    return 1


def main():
    jobs = []
    tex = os.path.join(PH, 'textures')
    for tid in sorted(os.listdir(tex)):
        for name, slots in (('diff', {'base'}), ('nor_gl', {'nrm'}), ('ard', {'nrm'})):
            src = os.path.join(tex, tid, f'{name}_1k.jpg')
            if os.path.exists(src):
                jobs.append((src, src[:-4] + '.ktx2', slots, True))
    models = os.path.join(PH, 'models')
    twins = []
    for mid in sorted(os.listdir(models)):
        d = os.path.join(models, mid)
        for f in os.listdir(d):
            if not f.endswith('.gltf') or f.endswith('.ktx2.gltf'):
                continue
            j = json.load(open(os.path.join(d, f), encoding='utf8'))
            rl = roles(j)
            for k, im in enumerate(j.get('images', [])):
                uri = im.get('uri', '')
                if not uri.lower().endswith(('.jpg', '.jpeg', '.png')):
                    continue
                src = os.path.join(d, uri)
                # Colour and packed metal/rough/AO maps are ETC1S; normals UASTC.
                slots = rl.get(k, set())
                kind = {'base'} if slots & {'base', 'emi'} or not slots else {'nrm'} if 'nrm' in slots else {'mr'}
                jobs.append((src, os.path.splitext(src)[0] + '.ktx2', kind, False))
            twins.append((d, f, j))
    with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(3) as pool:
        done = sum(pool.map(lambda a: to_ktx(a[1][0], a[1][1], a[1][2], tmp, str(a[0]), a[1][3]), enumerate(jobs)))
    for d, f, j in twins:
        for im in j.get('images', []):
            uri = im.get('uri', '')
            if uri.lower().endswith(('.jpg', '.jpeg', '.png')):
                im['uri'] = os.path.splitext(uri)[0] + '.ktx2'
                im['mimeType'] = 'image/ktx2'
        for t in j.get('textures', []):
            if 'source' in t:
                t.setdefault('extensions', {})['KHR_texture_basisu'] = {'source': t.pop('source')}
        for key in ('extensionsUsed', 'extensionsRequired'):
            j[key] = sorted(set(j.get(key, [])) | {'KHR_texture_basisu'})
        json.dump(j, open(os.path.join(d, f[:-5] + '.ktx2.gltf'), 'w', encoding='utf8'), separators=(',', ':'))
    print(f'{done} textures encoded, {len(twins)} model twins written')


if __name__ == '__main__':
    main()
